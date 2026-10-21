"""Load the pinned, pretrained bi-temporal change-detection model."""

import threading

import torch
from transformers import AutoImageProcessor, AutoModel

MODEL_ID = "deepang/adaptformer-LEVIR-CD"
MODEL_REVISION = "240df917623a3563431709a4cd621d9f739c8789"

_model = None
_processor = None
_device = None
_load_lock = threading.Lock()
_inference_lock = threading.Lock()


def get_model():
    """Load model weights once and keep the model resident for inference."""
    global _model, _processor, _device

    if _model is not None:
        return _processor, _model, _device

    with _load_lock:
        if _model is None:
            _device = torch.device(
                "cuda" if torch.cuda.is_available()
                else "mps" if getattr(torch.backends, "mps", None)
                and torch.backends.mps.is_available()
                else "cpu"
            )

            try:
                _processor = AutoImageProcessor.from_pretrained(
                    MODEL_ID,
                    revision=MODEL_REVISION,
                    use_fast=False,
                    trust_remote_code=True,
                )
                _model = AutoModel.from_pretrained(
                    MODEL_ID,
                    revision=MODEL_REVISION,
                    trust_remote_code=True,
                )
                _model.to(_device)
                _model.eval()
            except Exception as error:
                _processor = None
                _model = None
                _device = None
                raise RuntimeError(
                    f"Could not load {MODEL_ID} at revision {MODEL_REVISION}. "
                    "Check network access and the Hugging Face model cache."
                ) from error

    return _processor, _model, _device


def model_is_loaded():
    return _model is not None
