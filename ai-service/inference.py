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
    ("BUILDINGS", "#b7c4d3"),
    ("ROADS", "#f0c674"),
    ("BARE LAND", "#d5a45e"),
    ("OTHER", "#8b91a1"),
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
    change_mask = np.asarray(
        Image.fromarray(inference_mask).resize(
            (width, height),
            Image.Resampling.NEAREST,
        ),
        dtype=bool,
    )
    change_percent = float(change_mask.mean() * 100)
    confidence_percent = float(certainty_total / certainty_batches * 100)

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
    return brightness, sharpness, image.size


def assess_image_pair(before_bytes: bytes, after_bytes: bytes):
    before = _open_image(before_bytes, "BEFORE image")
    after = _open_image(after_bytes, "AFTER image")
    before_size = before.size
    after_size = after.size
    before, after = _align_pair(before, after)

    before_brightness, before_sharpness, _ = _image_metrics(before)
    after_brightness, after_sharpness, _ = _image_metrics(after)
    issues = []

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

    if min(*before_size, *after_size) < 64:
        issues.append({
            "type": "low_quality",
            "detected": True,
            "severity": "high",
            "explanation": "One or both images are too small for reliable pixel-level comparison.",
        })

    if before_sharpness < 3 and after_sharpness < 3:
        issues.append({
            "type": "blur",
            "detected": True,
            "severity": "medium",
            "explanation": "Both images have very little local detail, which can reduce change-mask reliability.",
        })

    brightness_difference = abs(before_brightness - after_brightness)
    if brightness_difference >= 55:
        issues.append({
            "type": "brightness_difference",
            "detected": True,
            "severity": "high" if brightness_difference >= 90 else "medium",
            "explanation": "A large average brightness difference may create apparent changes unrelated to land cover.",
        })

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
        "confidence": 80 if issues else 70,
        "issues": issues,
        "primaryReason": issues[0]["type"] if issues else "none",
        "recommendation": recommendation,
        "message": message,
    }
