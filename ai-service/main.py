"""FastAPI entry point for local satellite-image change detection."""

import asyncio
import logging

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from inference import ImageInputError, analyze_pair, assess_image_pair
from model import MODEL_ID, MODEL_REVISION, model_is_loaded

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("geozenx.ai")

app = FastAPI(
    title="GeoZenX Local Change Detection",
    version="1.0.0",
)


async def _read_image_pair(before_image: UploadFile, after_image: UploadFile):
    return await asyncio.gather(before_image.read(), after_image.read())


@app.get("/health")
async def health():
    return {
        "status": "ready",
        "modelLoaded": model_is_loaded(),
        "model": MODEL_ID,
        "revision": MODEL_REVISION,
    }


@app.post("/quality")
async def check_quality(
    beforeImage: UploadFile = File(...),
    afterImage: UploadFile = File(...),
):
    try:
        before_bytes, after_bytes = await _read_image_pair(beforeImage, afterImage)
        return await asyncio.to_thread(assess_image_pair, before_bytes, after_bytes)
    except ImageInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Local image quality checks failed.")
        raise HTTPException(status_code=500, detail="Local image quality checks failed.") from error


@app.post("/analyze")
async def analyze(
    beforeImage: UploadFile = File(...),
    afterImage: UploadFile = File(...),
    areaKm2: float | None = Form(default=None),
):
    if areaKm2 is not None and areaKm2 <= 0:
        raise HTTPException(status_code=422, detail="areaKm2 must be a positive number.")

    try:
        before_bytes, after_bytes = await _read_image_pair(beforeImage, afterImage)
        result = await asyncio.to_thread(analyze_pair, before_bytes, after_bytes, areaKm2)
        return {"success": True, "data": result}
    except ImageInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Local change-detection inference failed.")
        raise HTTPException(
            status_code=503,
            detail=f"Local change-detection inference failed: {error}",
        ) from error
