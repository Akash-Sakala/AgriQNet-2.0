"""YOLOv8 pest detector (102 IP102 classes) — FastAPI.

Run:  python -m uvicorn main:app --host 127.0.0.1 --port 8001     (cwd = this folder)
The AgriQNet API proxies /api/pest/detect to POST /detect/ here.
"""
import os
from pathlib import Path

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

HERE = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("PEST_MODEL_PATH", HERE / "best.pt"))
CONF = float(os.getenv("PEST_CONF_THRESHOLD", "0.05"))

app = FastAPI(title="AgriQNet Pest Detector", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Load the model once at startup
model = YOLO(str(MODEL_PATH))


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_PATH.name, "classes": len(model.names)}


@app.get("/classes")
def classes():
    return model.names


async def _detect(upload: UploadFile):
    img_bytes = await upload.read()
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return {"error": "Invalid image file"}

    results = model.predict(img, imgsz=640, conf=CONF, verbose=False)
    boxes = results[0].boxes
    if boxes is None or len(boxes) == 0:
        return {"pestType": None, "detections": []}

    ids = boxes.cls.cpu().numpy().astype(int)
    confs = boxes.conf.cpu().numpy()
    xyxy = boxes.xyxy.cpu().numpy()
    order = confs.argsort()[::-1]
    detections = [
        {"pestType": model.names[int(ids[i])], "confidence": float(confs[i]), "box": [round(float(v), 1) for v in xyxy[i]]}
        for i in order[:5]
    ]
    best = detections[0]
    return {"pestType": best["pestType"], "confidence": best["confidence"], "detections": detections}


# Both field names are accepted: "image" (dashboard/API) and "file" (old mock service).
@app.post("/detect/")
@app.post("/detect", include_in_schema=False)
async def detect_pest(image: UploadFile = File(None), file: UploadFile = File(None)):
    upload = image or file
    if upload is None:
        return {"error": "No image provided (multipart field 'image')"}
    return await _detect(upload)


if __name__ == "__main__":
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PEST_DETECTOR_PORT", "8001")))
