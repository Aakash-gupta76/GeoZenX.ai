# Local change-detection service

This service runs bi-temporal image inference locally with PyTorch. It serves the pinned
`deepang/adaptformer-LEVIR-CD` checkpoint, an AdaptFormer change-detection model trained on
LEVIR-CD. The model emits a binary changed/unchanged mask; it does not classify land-cover
types such as vegetation, water, roads, or buildings. The API also reports approximate RGB
color-rule estimates for vegetation, water, bare land, and other pixels. Achromatic built-up
pixels are split into estimated buildings and roads using local image texture. These categories
are indicative visual estimates, not verified multispectral classifications.

## Run

Use Python 3.10 or later with an available PyTorch wheel in a virtual environment. Install
PyTorch for the available CPU/GPU platform before installing the remaining requirements:

```powershell
cd ai-service
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install torch
python -m pip install -r requirements.txt

AI Service
python -m uvicorn main:app --host 127.0.0.1 --port 8000

API Server
$env:PORT = "5101"
npm --prefix server start

Frontend
$env:VITE_API_BASE_URL = "http://127.0.0.1:5101"
npm run dev -- --host 127.0.0.1 --port 5173
```

The model checkpoint and its pinned model code are downloaded from Hugging Face on first
inference and cached by the Hugging Face Hub. The initial request therefore needs network
access; subsequent requests use the local cache. The default Express backend connects to
`http://127.0.0.1:8000`. Override it with `AI_SERVICE_URL` in `server/.env` if needed.

Inference runs on the available PyTorch device. For a fast preview, the service preserves
the image aspect ratio and downsamples the longer side to at most 256 pixels before model
inference, then scales the binary mask back to the input dimensions. This is optimized for
interactive demos; small changes may be missed. The UI starts the request immediately and
shows an indeterminate progress indicator while the server works.

Endpoints:

- `GET /health` — service and model-load status
- `POST /quality` — local pair alignment, sharpness, and brightness checks
- `POST /analyze` — multipart `beforeImage` and `afterImage`; optional `areaKm2`

When image dimensions differ, the AFTER image is resized to the BEFORE image dimensions
so the model can process the pair. This does not correct spatial misalignment: both images
must still cover the same area and be registered. Resizing is reported as a quality warning.
Sharpness and brightness findings are also returned as quality warnings with the analysis.

The quality endpoint and analysis response now also include heuristic image-quality metrics,
preprocessing details, preliminary alignment checks, and a reliability summary. These fields are
intended to flag likely issues such as blur, contrast problems, resolution loss, or registration
risk without claiming verified model accuracy. For analytics, the frontend displays the same result
payload in a separate dashboard view with T1/T2 composition charts, a comparison chart, and a binary
change summary.

The model repository declares an MIT license. See its model card and paper for model limits,
training data, and citation details: <https://huggingface.co/deepang/adaptformer-LEVIR-CD>.

You can also Download PDF of the changes analyzed with Graph Analysis......And with the Transition Matrix and any False Changes Detected. 
