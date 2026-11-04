"""AgriQNet crop & fertilizer recommender (FastAPI, port 8002).

Default models — AgriQNet v3 quantum-hybrid (models/v3/, selected by the full-budget nested-CV study):
  crop        Gaussian NB on the 7 soil/climate readings + QUBO-selected quantum-circuit features (7 qubits)
  fert_npk    soft vote of SVM + quantum features, a quantum fidelity-kernel SVM and ExtraTrees + quantum
              features, from N, P, K (3 qubits)
  fert_full8  ExtraTrees + quantum features from temperature, humidity, moisture, soil type, crop type and
              N, P, K (6 qubits) — used automatically when those extra inputs are sent
The circuits are simulated exactly on the CPU by the bundled `agriqnet` package (no quantum hardware needed).

The original v1 models (models/*.pkl) stay as an automatic fallback, or set RECOMMENDER_MODELS=legacy.
"""
import math
import os
import pickle
import sys
import warnings

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from joblib import load

try:
    from sklearn.exceptions import InconsistentVersionWarning
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except Exception:  # pragma: no cover
    pass

from .schemas import CropInput, FertilizerInput, PredictionResponse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

V3_DIR = os.path.join(BASE_DIR, "models", "v3")
CROP_PATH = os.path.join(BASE_DIR, "models", "crop_reco_best_artifacts.pkl")
FERT_PATH = os.path.join(BASE_DIR, "models", "best_fertilizer_model.pkl")
MODE = os.environ.get("RECOMMENDER_MODELS", "v3").lower()

QUBITS = {"crop": 7, "fert_npk": 3, "fert_full8": 6}
V3 = {}
V3_INFO = {}
V3_ERRORS = {}

SOIL_MAP = {
    "red": "Red", "red soil": "Red", "black": "Black", "black soil": "Black", "clay": "Clayey",
    "clay soil": "Clayey", "clayey": "Clayey", "sandy": "Sandy", "sandy soil": "Sandy", "loamy": "Loamy",
    "loam": "Loamy", "alluvial": "Loamy", "alluvial soil": "Loamy",
}
CROP_TYPE_MAP = {
    "paddy": "Paddy", "rice": "Paddy", "maize": "Maize", "cotton": "Cotton", "sugarcane": "Sugarcane",
    "wheat": "Wheat", "barley": "Barley", "tobacco": "Tobacco", "groundnut": "Ground Nuts",
    "ground nuts": "Ground Nuts", "groundnuts": "Ground Nuts", "ragi": "Millets", "jowar": "Millets",
    "millets": "Millets", "millet": "Millets", "bajra": "Millets", "soybean": "Oil seeds", "sunflower": "Oil seeds",
    "mustard": "Oil seeds", "oil seeds": "Oil seeds", "oilseeds": "Oil seeds", "pulses": "Pulses", "tur": "Pulses",
    "bengalgram": "Pulses", "greengram": "Pulses", "chickpea": "Pulses", "lentil": "Pulses", "blackgram": "Pulses",
    "mungbean": "Pulses", "pigeonpeas": "Pulses", "kidneybeans": "Pulses", "mothbeans": "Pulses",
}


def _load_v3():
    import json

    import pandas as pd

    for task in ("crop", "fert_npk", "fert_full8"):
        d = os.path.join(V3_DIR, task)
        try:
            rec = load(os.path.join(d, "model.joblib"))
            manifest = json.load(open(os.path.join(d, "manifest.json"), encoding="utf-8"))
            sample = pd.read_csv(os.path.join(d, "sample_input.csv"))
            expected = np.load(os.path.join(d, "sample_proba.npy"))
            drift = float(np.abs(rec.predict_proba(sample) - expected).max())
            if drift > 1e-6:
                raise RuntimeError(f"self-test mismatch {drift:.2e} (library versions differ from the export)")
            V3[task] = rec
            V3_INFO[task] = {
                "id": f"agriqnet-v3/{task}", "name": "AgriQNet v3 quantum-hybrid", "qubits": QUBITS[task],
                "description": manifest.get("description", rec.description),
                "members": manifest.get("refit", {}).get("members"),
                "nested_cv": manifest.get("nested_cv"),
                "quantum_features": {k: [f for f in v if "[" in f] for k, v in rec.selected_features.items()},
                "self_test_max_diff": drift,
            }
            print(f"Loaded v3 {task}: {V3_INFO[task]['description']}")
        except Exception as e:  # keep serving with the legacy model
            V3_ERRORS[task] = repr(e)[:300]
            print(f"v3 {task} unavailable ({e}); legacy model will be used.")


def _v3_answer(task, row):
    import pandas as pd

    rec = V3[task]
    X = pd.DataFrame([row], columns=rec.input_columns)
    P = rec.predict_proba(X)[0]
    order = np.argsort(-P)
    labels = rec.label_names
    sets = []
    if rec.qhat is not None:
        sets = [labels[j] for j in np.where(1 - P <= rec.qhat)[0]] or [labels[order[0]]]
        sets = sorted(set(sets) | {labels[order[0]]}, key=lambda s: -P[labels.index(s)])
    info = V3_INFO[task]
    return {
        "prediction": labels[order[0]],
        "details": {
            "confidence": float(P[order[0]]),
            "top3": [{"label": labels[j], "probability": round(float(P[j]), 4)} for j in order[:3]],
            "conformal_set": sets,
            "conformal_level": 1 - rec.alpha,
            "model": {k: info[k] for k in ("id", "name", "qubits", "description", "members")},
        },
    }


# ---------------- legacy v1 models (fallback) ----------------
crop_model = crop_feature_set = crop_label_encoder = crop_minmax = crop_std = None
fert_model_type = fert_model = fert_scaler = fert_label_encoder = fert_minmax = fert_X_train_q = None


def angle_embedding(X_minmax):
    thetas = np.asarray(X_minmax) * math.pi
    return np.hstack([np.sin(thetas), np.cos(thetas)])


def build_crop_features(arr_minmax, arr_std, feature_set):
    angle = angle_embedding(arr_minmax)
    if feature_set == "angle_only":
        return angle
    if feature_set == "std_only":
        return arr_std
    if feature_set == "combined":
        return np.hstack([arr_std, angle])
    raise ValueError("Unknown feature_set in crop artifacts")


def _load_legacy():
    global crop_model, crop_feature_set, crop_label_encoder, crop_minmax, crop_std
    global fert_model_type, fert_model, fert_scaler, fert_label_encoder, fert_minmax, fert_X_train_q
    try:
        a = load(CROP_PATH)
        crop_model, crop_feature_set = a["model"], a["feature_set"]
        crop_label_encoder, crop_minmax, crop_std = a["label_encoder"], a["minmax_scaler"], a["std_scaler"]
    except Exception as e:
        print("Legacy crop model unavailable:", e)
    try:
        with open(FERT_PATH, "rb") as f:
            saved = pickle.load(f)
        fert_model_type, fert_label_encoder = saved["model_type"], saved["label_encoder"]
        if fert_model_type in ("random_forest", "mlp"):
            fert_model, fert_scaler = saved["model"], saved["scaler"]
    except Exception as e:
        print("Legacy fertilizer model unavailable:", e)


def _legacy_crop(p: CropInput):
    if crop_model is None:
        raise HTTPException(status_code=500, detail="Crop model not loaded")
    arr = np.array([[p.N, p.P, p.K, p.temperature, p.humidity, p.ph, p.rainfall]])
    X = build_crop_features(crop_minmax.transform(arr), crop_std.transform(arr), crop_feature_set)
    pred = crop_label_encoder.inverse_transform([crop_model.predict(X)[0]])[0]
    out = {"prediction": pred, "details": {"model": {"id": "legacy-v1/crop", "name": "v1 classical", "qubits": 0}}}
    if hasattr(crop_model, "predict_proba"):
        out["details"]["confidence"] = float(np.max(crop_model.predict_proba(X)))
    return out


def _legacy_fert(p: FertilizerInput):
    if fert_model is None:
        raise HTTPException(status_code=500, detail="Fertilizer model not loaded")
    X = fert_scaler.transform(np.array([[p.Nitrogen, p.Potassium, p.Phosphorous]]))
    pred = fert_label_encoder.inverse_transform([fert_model.predict(X)[0]])[0]
    out = {"prediction": pred, "details": {"model": {"id": "legacy-v1/fertilizer", "name": "v1 classical",
                                                     "qubits": 0}}}
    if hasattr(fert_model, "predict_proba"):
        out["details"]["confidence"] = float(np.max(fert_model.predict_proba(X)))
    return out


# ---------------- app ----------------
app = FastAPI(
    title="AgriQNet Crop & Fertilizer Recommender",
    description="Quantum-hybrid (AgriQNet v3) crop and fertilizer recommendation with calibrated top-3 and "
                "90% conformal recommendation sets",
    version="3.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def load_all_models():
    if MODE != "legacy":
        _load_v3()
    _load_legacy()


@app.get("/health")
def health():
    crop_ok = "crop" in V3 or crop_model is not None
    fert_ok = "fert_npk" in V3 or fert_model is not None
    return {
        "status": "ok" if (crop_ok and fert_ok) else "degraded",
        "mode": MODE,
        "crop_model": V3_INFO.get("crop", {}).get("description") or (crop_model and "legacy v1"),
        "fertilizer_model": V3_INFO.get("fert_npk", {}).get("description") or fert_model_type,
        "fertilizer_model_full": V3_INFO.get("fert_full8", {}).get("description"),
        "v3_errors": V3_ERRORS or None,
    }


@app.get("/api/models")
def models():
    return {"mode": MODE, "v3": V3_INFO, "v3_errors": V3_ERRORS}


@app.post("/api/crop_recommender/predict", response_model=PredictionResponse)
def predict_crop(payload: CropInput):
    try:
        if "crop" in V3:
            return _v3_answer("crop", {"N": payload.N, "P": payload.P, "K": payload.K,
                                       "temperature": payload.temperature, "humidity": payload.humidity,
                                       "ph": payload.ph, "rainfall": payload.rainfall})
        return _legacy_crop(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Crop prediction failed: {e}")


@app.post("/api/fertilizer_recommender/predict", response_model=PredictionResponse)
def predict_fertilizer(payload: FertilizerInput):
    try:
        soil = SOIL_MAP.get(str(payload.soil_type or "").strip().lower())
        ctype = CROP_TYPE_MAP.get(str(payload.crop_type or "").strip().lower())
        full = (payload.temperature is not None and payload.humidity is not None and payload.moisture is not None
                and soil is not None and ctype is not None)
        if full and "fert_full8" in V3:
            return _v3_answer("fert_full8", {
                "Temperature": payload.temperature, "Humidity": payload.humidity, "Moisture": payload.moisture,
                "Nitrogen": payload.Nitrogen, "Potassium": payload.Potassium, "Phosphorous": payload.Phosphorous,
                "Soil Type": soil, "Crop Type": ctype})
        if "fert_npk" in V3:
            return _v3_answer("fert_npk", {"Nitrogen": payload.Nitrogen, "Potassium": payload.Potassium,
                                           "Phosphorous": payload.Phosphorous})
        return _legacy_fert(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fertilizer prediction failed: {e}")
