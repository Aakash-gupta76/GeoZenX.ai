"""Image validation, local quality checks, and tiled change-mask inference."""

import base64
from datetime import datetime, timezone
from io import BytesIO

import numpy as np
import torch
import torch.nn.functional as functional
from PIL import Image, ImageOps, UnidentifiedImageError

from model import MODEL_ID, get_model, _inference_lock

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
TILE_SIZE = 256
TILE_OVERLAP = 32
INFERENCE_BATCH_SIZE = 8
MAX_INFERENCE_SIDE = 256
LAND_COVER_CLASSES = (
    ("VEGETATION", "#36c98f"),
    ("WATER", "#4d9dff"),
    ("BUILDINGS", "#8f337d"),
    ("ROADS", "#f0c674"),
    ("BARE LAND", "#c14e63"),
    ("OTHER", "#b7c4d3"),
)


class ImageInputError(ValueError):
    """Raised when an uploaded temporal image pair cannot be processed."""


def _open_image(image_bytes: bytes, name: str) -> Image.Image:
    if not image_bytes:
        raise ImageInputError(f"{name} is empty.")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise ImageInputError(f"{name} exceeds the 10 MB upload limit.")

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            width, height = image.size
            if width < 2 or height < 2:
                raise ImageInputError(f"{name} must be at least 2 × 2 pixels.")
            if width * height > MAX_IMAGE_PIXELS:
                raise ImageInputError(
                    f"{name} exceeds the {MAX_IMAGE_PIXELS:,}-pixel processing limit."
                )
            image.load()
            return ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise ImageInputError(f"{name} is not a supported image.") from error


def _open_pair(before_bytes: bytes, after_bytes: bytes):
    before = _open_image(before_bytes, "BEFORE image")
    after = _open_image(after_bytes, "AFTER image")
    return _align_pair(before, after)


def _align_pair(before: Image.Image, after: Image.Image):
    if before.size != after.size:
        after = after.resize(before.size, Image.Resampling.LANCZOS)
    return before, after


def _tile_starts(length: int) -> list[int]:
    if length <= TILE_SIZE:
        return [0]

    stride = TILE_SIZE - TILE_OVERLAP
    starts = list(range(0, length - TILE_SIZE + 1, stride))
    final_start = length - TILE_SIZE
    if starts[-1] != final_start:
        starts.append(final_start)
    return starts


def _tile_array(image_array: np.ndarray, x: int, y: int) -> np.ndarray:
    tile = image_array[y:y + TILE_SIZE, x:x + TILE_SIZE]
    pad_height = TILE_SIZE - tile.shape[0]
    pad_width = TILE_SIZE - tile.shape[1]
    if pad_height or pad_width:
        mode = "reflect" if tile.shape[0] > 1 and tile.shape[1] > 1 else "edge"
        tile = np.pad(
            tile,
            ((0, pad_height), (0, pad_width), (0, 0)),
            mode=mode,
        )
    return tile


def _infer_tile_batch(before_tiles, after_tiles, processor, model, device):
    before_images = [Image.fromarray(tile) for tile in before_tiles]
    after_images = [Image.fromarray(tile) for tile in after_tiles]
    inputs = processor(
        images=(before_images, after_images),
        return_tensors="pt",
    )
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with _inference_lock, torch.inference_mode():
        output = model(**inputs)
        logits = output.logits
        if logits.ndim != 4 or logits.shape[1] < 2:
            raise RuntimeError(
                f"Expected two-class change logits, received shape {tuple(logits.shape)}."
            )
        logits = functional.interpolate(
            logits,
            size=(TILE_SIZE, TILE_SIZE),
            mode="bilinear",
            align_corners=False,
        )
        probabilities = logits.softmax(dim=1)
        changed_probability = probabilities[:, 1].float().cpu().numpy()
        confidence = probabilities.max(dim=1).values.float().mean().item()

    return changed_probability, confidence


def _encode_mask(mask: np.ndarray) -> str:
    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[mask] = (91, 224, 190, 230)
    image = Image.fromarray(rgba, mode="RGBA")
    image.thumbnail((1024, 1024), Image.Resampling.NEAREST)
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _classify_rgb(image_array: np.ndarray) -> np.ndarray:
    rgb = image_array.astype(np.float32)
    red, green, blue = np.moveaxis(rgb, -1, 0)
    brightness = (red + green + blue) / 3
    maximum = np.maximum(np.maximum(red, green), blue)
    minimum = np.minimum(np.minimum(red, green), blue)
    saturation = np.divide(
        maximum - minimum,
        maximum,
        out=np.zeros_like(maximum),
        where=maximum > 0,
    )

    labels = np.full(red.shape, 5, dtype=np.uint8)
    vegetation = (
        (green >= red * 1.08)
        & (green >= blue * 1.05)
        & (green - red >= 10)
        & (green >= 40)
    )
    water = (
        ~vegetation
        & (blue >= red * 1.08)
        & (blue >= green * 1.15)
        & (blue - red >= 8)
        & (blue - green >= 15)
        & (brightness < 190)
    )
    built_up = (
        ~vegetation
        & ~water
        & (saturation <= 0.18)
        & (brightness >= 35)
        & (brightness <= 225)
    )
    padded_brightness = np.pad(brightness, 2, mode="edge")
    local_mean = np.zeros_like(brightness)
    local_mean_square = np.zeros_like(brightness)
    for row in range(5):
        for column in range(5):
            neighborhood = padded_brightness[
                row:row + brightness.shape[0],
                column:column + brightness.shape[1],
            ]
            local_mean += neighborhood
            local_mean_square += neighborhood * neighborhood
    local_mean /= 25
    local_variance = np.maximum(local_mean_square / 25 - local_mean * local_mean, 0)
    roads = built_up & (local_variance < 18 ** 2)
    buildings = built_up & ~roads

    bare_land = (
        ~vegetation
        & ~water
        & ~built_up
        & (red >= green * 0.95)
        & (green > blue * 1.03)
        & (brightness >= 45)
    )

    labels[vegetation] = 0
    labels[water] = 1
    labels[buildings] = 2
    labels[roads] = 3
    labels[bare_land] = 4
    return labels


def _summarize_land_cover(before_array: np.ndarray, after_array: np.ndarray):
    before_labels = _classify_rgb(before_array)
    after_labels = _classify_rgb(after_array)
    total_pixels = before_labels.size
    transition_counts = np.bincount(
        (before_labels.ravel() * len(LAND_COVER_CLASSES) + after_labels.ravel()),
        minlength=len(LAND_COVER_CLASSES) ** 2,
    ).reshape(len(LAND_COVER_CLASSES), len(LAND_COVER_CLASSES))
    transition_percent = transition_counts / total_pixels * 100

    classes = []
    for index, (name, color) in enumerate(LAND_COVER_CLASSES):
        before_percent = float(np.count_nonzero(before_labels == index) / total_pixels * 100)
        after_percent = float(np.count_nonzero(after_labels == index) / total_pixels * 100)
        incoming = transition_percent[:, index].copy()
        outgoing = transition_percent[index, :].copy()
        incoming[index] = 0
        outgoing[index] = 0
        source_index = int(np.argmax(incoming))
        destination_index = int(np.argmax(outgoing))
        description = (
            f"RGB visual estimate: {before_percent:.2f}% in T1 and {after_percent:.2f}% in T2 "
            f"({after_percent - before_percent:+.2f} percentage points)."
        )
        if incoming[source_index] > 0:
            description += (
                f" About {incoming[source_index]:.2f}% of the image shifted from "
                f"{LAND_COVER_CLASSES[source_index][0].lower()} to {name.lower()}."
            )
        if outgoing[destination_index] > 0:
            description += (
                f" About {outgoing[destination_index]:.2f}% shifted from "
                f"{name.lower()} to {LAND_COVER_CLASSES[destination_index][0].lower()}."
            )

        classes.append({
            "category": name,
            "t1Percent": round(before_percent, 2),
            "t2Percent": round(after_percent, 2),
            "changePercent": round(after_percent - before_percent, 2),
            "color": color,
            "description": description,
        })

    return {
        "method": "RGB color-rule visual estimate",
        "classes": classes,
        "totalChangedClassPercent": round(
            float(100 - np.trace(transition_percent)),
            2,
        ),
    }


def analyze_pair(before_bytes: bytes, after_bytes: bytes, area_km2: float | None = None):
    before, after = _open_pair(before_bytes, after_bytes)
    width, height = before.size
    scale = min(1, MAX_INFERENCE_SIDE / max(width, height))
    inference_width = max(2, round(width * scale))
    inference_height = max(2, round(height * scale))
    if (inference_width, inference_height) != (width, height):
        inference_size = (inference_width, inference_height)
        before = before.resize(inference_size, Image.Resampling.LANCZOS)
        after = after.resize(inference_size, Image.Resampling.LANCZOS)

    processor, model, device = get_model()

    before_array = np.asarray(before)
    after_array = np.asarray(after)
    land_cover = _summarize_land_cover(before_array, after_array)
    probability_sum = np.zeros((inference_height, inference_width), dtype=np.float32)
    coverage_count = np.zeros((inference_height, inference_width), dtype=np.uint16)
    coordinates = [
        (x, y)
        for y in _tile_starts(inference_height)
        for x in _tile_starts(inference_width)
    ]
    certainty_total = 0.0
    certainty_batches = 0

    for batch_start in range(0, len(coordinates), INFERENCE_BATCH_SIZE):
        batch_coordinates = coordinates[batch_start:batch_start + INFERENCE_BATCH_SIZE]
        before_tiles = [_tile_array(before_array, x, y) for x, y in batch_coordinates]
        after_tiles = [_tile_array(after_array, x, y) for x, y in batch_coordinates]
        probabilities, confidence = _infer_tile_batch(
            before_tiles,
            after_tiles,
            processor,
            model,
            device,
        )

        certainty_total += confidence * len(batch_coordinates)
        certainty_batches += len(batch_coordinates)
        for (x, y), tile_probability in zip(batch_coordinates, probabilities):
            tile_height = min(TILE_SIZE, inference_height - y)
            tile_width = min(TILE_SIZE, inference_width - x)
            probability_sum[y:y + tile_height, x:x + tile_width] += tile_probability[
                :tile_height, :tile_width
            ]
            coverage_count[y:y + tile_height, x:x + tile_width] += 1

    if np.any(coverage_count == 0):
        raise RuntimeError("Tiled inference did not cover every input pixel.")

    changed_probability = probability_sum / coverage_count
    inference_mask = changed_probability >= 0.5
    uncertain_mask = (changed_probability >= 0.4) & (changed_probability <= 0.6)
    uncertain_pixel_percentage = float(uncertain_mask.mean() * 100)
    change_mask = np.asarray(
        Image.fromarray(inference_mask).resize(
            (width, height),
            Image.Resampling.NEAREST,
        ),
        dtype=bool,
    )
    change_percent = float(change_mask.mean() * 100)
    confidence_percent = float(certainty_total / certainty_batches * 100)

    quality_summary = {
        "t1": _quality_summary(before, "T1", pre_resize=(width, height)),
        "t2": _quality_summary(after, "T2", pre_resize=(width, height)),
        "alignment": _alignment_screen(before, after),
        "preprocessing": {
            "original_dimensions": {
                "t1": {"width": width, "height": height, "pixel_count": width * height},
                "t2": {"width": width, "height": height, "pixel_count": width * height},
            },
            "resized_to_match": False,
            "matching_dimensions": True,
            "effective_inference_dimensions": {"width": inference_width, "height": inference_height},
            "max_longest_side_limit": MAX_INFERENCE_SIDE,
            "downsampled_for_inference": scale < 1,
            "warning": "For fast preview, the longer side is downsampled to a maximum of 256 pixels before inference. Small or narrow changes can be missed."
        },
    }
    reliability = _build_reliability_summary(
        [
            "The model output is assessed heuristically from image quality and probability margins.",
        ] if uncertain_pixel_percentage > 10 else [],
        quality_summary,
        {
            "available": True,
            "uncertain_pixel_percentage": uncertain_pixel_percentage,
        },
    )
    uncertainty = {
        "available": True,
        "method": "Distance from the decision threshold (0.5) using model change probabilities",
        "uncertain_pixel_percentage": round(uncertain_pixel_percentage, 2),
        "explanation": (
            "Pixels close to the 0.5 decision threshold are treated as uncertain because the model's output is near the classification boundary. "
            "This is a heuristic uncertainty estimate and not an independent calibrated probability of correctness."
        ),
    }

    summary = {
        "primaryVector": "Binary change detected",
        "totalAnalyzedAreaKm2": area_km2,
        "netClassShiftPercent": round(change_percent, 2),
        "confidenceScore": round(confidence_percent, 2),
        "filteredConfidenceScore": round(confidence_percent, 2),
        "spatialResolution": (
            f"Binary change preview at {inference_width} × {inference_height} inference pixels"
        ),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    transition = {
        "category": "CHANGED AREA",
        "t1Percent": 0,
        "t2Percent": round(change_percent, 2),
        "changePercent": round(change_percent, 2),
        "color": "#5be0be",
        "description": (
            f"The bi-temporal model identified {change_percent:.2f}% of aligned pixels "
            "as changed. This model detects binary change, not land-cover classes."
        ),
        "filteredNoiseDelta": 0,
    }

    return {
        "transitionMatrix": land_cover["classes"],
        "landCover": land_cover,
        "binaryChange": transition,
        "summary": summary,
        "maskSrc": _encode_mask(change_mask),
        "changeMask": {
            "width": width,
            "height": height,
            "inferenceWidth": inference_width,
            "inferenceHeight": inference_height,
            "changedPixelPercent": round(change_percent, 2),
            "threshold": 0.5,
        },
        "processing": {
            "inputWidth": width,
            "inputHeight": height,
            "inferenceWidth": inference_width,
            "inferenceHeight": inference_height,
            "downsampled": scale < 1,
        },
        "imageQuality": quality_summary,
        "analysisReliability": reliability,
        "predictionUncertainty": uncertainty,
        "model": {
            "id": MODEL_ID,
            "revision": "240df917623a3563431709a4cd621d9f739c8789",
        },
    }


def _image_metrics(image: Image.Image):
    grayscale = np.asarray(image.convert("L"), dtype=np.float32)
    horizontal = np.diff(grayscale, axis=1)
    vertical = np.diff(grayscale, axis=0)
    sharpness = float((horizontal.var() + vertical.var()) / 2)
    brightness = float(grayscale.mean())
    contrast = float(grayscale.std())
    return brightness, sharpness, contrast, image.size


def _blur_label(sharpness_score: float) -> tuple[str, str]:
    if sharpness_score >= 120:
        return "Clear", "The image has strong local detail and is unlikely to be blurred."
    if sharpness_score >= 30:
        return "Potentially Blurry", "The image may be slightly soft; fine change boundaries can be harder to detect."
    return "Severely Blurry", "The image lacks local contrast and is likely out of focus or heavily softened."


def _brightness_label(mean_luminance: float) -> tuple[str, str]:
    if mean_luminance < 45:
        return "Underexposed", "The image is notably dark and may hide ground detail."
    if mean_luminance > 210:
        return "Overexposed", "The image is notably bright and may wash out detail."
    return "Normal", "The overall luminance is within a moderate range for visual comparison."


def _contrast_label(contrast_score: float) -> tuple[str, str]:
    if contrast_score < 18:
        return "Low Contrast", "The dynamic range is compressed, which can suppress subtle changes."
    if contrast_score > 75:
        return "High Contrast", "The image has strong tonal separation, which is usually manageable for comparison."
    return "Balanced", "The image contrast is within a usable range for change detection."


def _alignment_screen(before: Image.Image, after: Image.Image):
    before_gray = np.asarray(before.convert("L"), dtype=np.float32)
    after_gray = np.asarray(after.convert("L"), dtype=np.float32)
    if before_gray.shape != after_gray.shape:
        return {
            "status": "mismatch",
            "score": 0.0,
            "explanation": "Images do not share identical dimensions, so alignment cannot be established from a direct feature comparison.",
        }

    before_norm = (before_gray - before_gray.mean()) / (before_gray.std() + 1e-6)
    after_norm = (after_gray - after_gray.mean()) / (after_gray.std() + 1e-6)
    corr = np.corrcoef(before_norm.ravel(), after_norm.ravel())[0, 1]
    alignment_score = float(np.nan_to_num(corr, nan=0.0))
    if alignment_score < -1:
        alignment_score = -1.0
    alignment_score = max(0.0, min(1.0, abs(alignment_score)))

    if alignment_score >= 0.92:
        status = "Clear"
        explanation = "Preliminary feature alignment is strong, but this is not a verified geospatial registration check."
    elif alignment_score >= 0.75:
        status = "Potentially Misaligned"
        explanation = "The image pair has moderate similarity, but local offsets or seasonal geometry changes could still affect the change mask."
    else:
        status = "Likely Misaligned"
        explanation = "The image pair does not align well enough for trustworthy change interpretation without proper registration."

    return {
        "status": status,
        "score": round(alignment_score, 3),
        "explanation": explanation + " This is a preliminary check only and not a verified georegistration result.",
    }


def _quality_summary(image: Image.Image, name: str, *, pre_resize: tuple[int, int] | None = None):
    brightness, sharpness, contrast, size = _image_metrics(image)
    blur_label, blur_message = _blur_label(sharpness)
    brightness_label, brightness_message = _brightness_label(brightness)
    contrast_label, contrast_message = _contrast_label(contrast)
    width, height = size
    pixel_count = width * height
    summary = {
        "name": name,
        "width": width,
        "height": height,
        "pixel_count": pixel_count,
        "aspect_ratio": round(width / height, 4) if height else None,
        "brightness_mean": round(brightness, 2),
        "brightness_std": round(contrast, 2),
        "sharpness_score": round(sharpness, 2),
        "blur_status": blur_label,
        "brightness_status": brightness_label,
        "contrast_status": contrast_label,
        "explanation": (
            f"{blur_message} {brightness_message} {contrast_message} "
            "These are heuristic quality indicators for image reliability, not direct model accuracy estimates."
        ),
        "recommendation": (
            "Use a sharper, better exposed image or re-check capture settings before interpreting small changes."
            if blur_label != "Clear" or brightness_label != "Normal" or contrast_label != "Balanced"
            else "Image quality looks acceptable for comparison."
        ),
        "pre_resize": pre_resize,
    }
    return summary


def _build_reliability_summary(factors: list[str], quality_summary: dict, uncertainty_summary: dict | None):
    factor_count = len(factors)
    normalized_score = max(0, 90 - factor_count * 18)
    if uncertainty_summary and uncertainty_summary.get("uncertain_pixel_percentage") is not None:
        normalized_score -= min(30, uncertainty_summary["uncertain_pixel_percentage"] * 0.7)

    score = max(0, min(100, round(normalized_score)))
    if factor_count == 0 and (not uncertainty_summary or not uncertainty_summary.get("available")):
        status = "high"
    elif score >= 70:
        status = "moderate"
    elif score >= 45:
        status = "low"
    else:
        status = "insufficient_data" if factor_count == 0 else "low"

    recommendations = [
        "Review image alignment before interpreting small or fragmented change clusters.",
        "Check whether similar brightness, haze, or blur levels are affecting the apparent change mask.",
        "Interpret the result as a heuristic change estimate unless the source imagery is well registered and comparable."
    ]
    if factor_count:
        recommendations.insert(0, "Use the quality findings to decide whether the comparison is trustworthy for change interpretation.")
    limitations = [
        "This assessment is heuristic and not an independent measure of model accuracy.",
        "No ground-truth validation data or calibrated confidence model is assumed here.",
        "Low-resolution or downsampled imagery can hide small or narrow change features.",
        "Feature-based alignment is preliminary and does not confirm geospatial registration."
    ]
    return {
        "status": status,
        "score": score,
        "score_type": "heuristic",
        "factors": factors,
        "limitations": limitations,
        "recommendations": recommendations,
    }


def assess_image_pair(before_bytes: bytes, after_bytes: bytes):
    before = _open_image(before_bytes, "BEFORE image")
    after = _open_image(after_bytes, "AFTER image")
    before_size = before.size
    after_size = after.size
    before, after = _align_pair(before, after)

    before_brightness, before_sharpness, before_contrast, _ = _image_metrics(before)
    after_brightness, after_sharpness, after_contrast, _ = _image_metrics(after)
    issues = []
    factors = []

    if before_size != after_size:
        issues.append({
            "type": "image_resampled",
            "detected": True,
            "severity": "medium",
            "explanation": (
                f"The AFTER image was resized from {after_size[0]} × {after_size[1]} to "
                f"{before_size[0]} × {before_size[1]} pixels to match the BEFORE image. "
                "Resizing does not correct spatial misalignment; confirm both images cover "
                "the same area and are registered before interpreting the results."
            ),
        })
        factors.append("Different native dimensions require resizing before comparison.")

    if min(*before_size, *after_size) < 64:
        issues.append({
            "type": "low_quality",
            "detected": True,
            "severity": "high",
            "explanation": "One or both images are too small for reliable pixel-level comparison.",
        })
        factors.append("Very small image dimensions reduce pixel-level reliability.")

    if before_sharpness < 30 or after_sharpness < 30:
        issues.append({
            "type": "blur",
            "detected": True,
            "severity": "medium" if before_sharpness >= 10 or after_sharpness >= 10 else "high",
            "explanation": "One or both images have reduced local detail, which can blur change boundaries and reduce reliability.",
        })
        factors.append("Blur or low edge detail may soften change boundaries.")

    brightness_difference = abs(before_brightness - after_brightness)
    if brightness_difference >= 55:
        issues.append({
            "type": "brightness_difference",
            "detected": True,
            "severity": "high" if brightness_difference >= 90 else "medium",
            "explanation": "A large average brightness difference may create apparent changes unrelated to land cover.",
        })
        factors.append("Brightness mismatch may create false change signals.")

    if before_contrast < 18 or after_contrast < 18:
        issues.append({
            "type": "low_contrast",
            "detected": True,
            "severity": "medium",
            "explanation": "One or both images have low contrast, reducing the ability to distinguish subtle changes.",
        })
        factors.append("Low image contrast can suppress subtle land-cover differences.")

    alignment = _alignment_screen(before, after)
    alignment_issue = alignment["status"] in {"Potentially Misaligned", "Likely Misaligned"}
    if alignment_issue:
        issues.append({
            "type": "alignment_warning",
            "detected": True,
            "severity": "medium" if alignment["score"] >= 0.75 else "high",
            "score": alignment["score"],
            "explanation": alignment["explanation"],
        })
        factors.append("Preliminary alignment check suggests a possible registration issue.")

    image_quality = {
        "t1": _quality_summary(before, "T1"),
        "t2": _quality_summary(after, "T2"),
        "alignment": {
            "status": alignment["status"],
            "score": alignment["score"],
            "explanation": alignment["explanation"],
        },
        "preprocessing": {
            "original_dimensions": {
                "t1": {"width": before_size[0], "height": before_size[1], "pixel_count": before_size[0] * before_size[1]},
                "t2": {"width": after_size[0], "height": after_size[1], "pixel_count": after_size[0] * after_size[1]},
            },
            "resized_to_match": before_size != after_size,
            "matching_dimensions": before.size == after.size,
            "effective_inference_dimensions": {"width": before.size[0], "height": before.size[1]},
            "max_longest_side_limit": MAX_INFERENCE_SIDE,
            "downsampled_for_inference": False,
            "warning": "Matching dimensions do not guarantee spatial registration. Images can still be misaligned or cover different scenes.",
        },
    }

    uncertainty = {
        "available": False,
        "method": "unavailable",
        "uncertain_pixel_percentage": None,
        "explanation": "Independent uncertainty estimation is unavailable for this local heuristic assessment.",
    }
    reliability = _build_reliability_summary(factors, image_quality, uncertainty)

    high_risk = any(issue["severity"] == "high" for issue in issues)
    risk = "high" if high_risk else "medium" if issues else "low"
    valid = not high_risk
    message = (
        "Image pair may produce unreliable change results."
        if high_risk
        else "Image pair is ready for local change detection."
        if not issues
        else "Image pair is usable, but the detected quality differences may affect results."
    )
    recommendation = (
        "Use spatially aligned images with matching dimensions and similar image quality."
        if high_risk
        else "Review the detected quality differences when interpreting the change mask."
        if issues
        else "No major image-quality differences were found by the local checks."
    )

    return {
        "validForChangeDetection": valid,
        "falseDetectionRisk": risk,
        "confidence": max(25, 90 - len(issues) * 15),
        "issues": issues,
        "primaryReason": issues[0]["type"] if issues else "none",
        "recommendation": recommendation,
        "message": message,
        "imageQuality": image_quality,
        "analysisReliability": reliability,
        "predictionUncertainty": uncertainty,
    }
