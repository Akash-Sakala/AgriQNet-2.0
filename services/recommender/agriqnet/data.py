"""Dataset loaders and task specifications for AgriQNet."""
import hashlib
import os

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

from .models import TaskSpec

FERT8_URL = "https://huggingface.co/datasets/kaifahmad/Fertilizer-Prediction/resolve/main/Fertilizer%20Prediction.csv"
FERT_SHORT = {
    "Twenty Eight-Twenty Eight": "28-28", "Fourteen-Thirty Five-Fourteen": "14-35-14",
    "Twenty-Twenty": "20-20", "Seventeen-Seventeen-Seventeen": "17-17-17",
    "Ten-Twenty Six-Twenty Six": "10-26-26", "Urea": "Urea", "DAP": "DAP",
}
CROP_FEATURES = ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"]
NPK = ["Nitrogen", "Potassium", "Phosphorous"]
FERT8_NUMERIC = ["Temperature", "Humidity", "Moisture", "Nitrogen", "Potassium", "Phosphorous"]
FERT8_CATEGORICAL = ["Soil Type", "Crop Type"]


def find_file(names, extra_dirs=()):
    dirs = list(extra_dirs) + [".", "/content", "/content/data", "/content/drive/MyDrive/AgriQNet/data",
                               "/content/drive/MyDrive/AgriQNet", "/content/drive/MyDrive"]
    for d in dirs:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return None


def file_sha256(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def _clean_columns(df):
    df = df.loc[:, ~df.columns.astype(str).str.startswith("Unnamed")].copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df.rename(columns={"Temparature": "Temperature"})


def load_crop(path=None):
    path = path or find_file(["Crop_recommendation.csv"])
    if path is None:
        raise FileNotFoundError("Upload Crop_recommendation.csv (2200 rows) to /content or Drive/AgriQNet/data")
    df = _clean_columns(pd.read_csv(path))
    df = df[CROP_FEATURES + ["label"]].dropna().reset_index(drop=True)
    return df, path


def load_fertilizer_npk(path=None):
    path = path or find_file(["Fertilizer.csv"])
    if path is None:
        df8, p8 = load_fertilizer_full8()
        return df8[NPK + ["Fertilizer Name"]].copy(), p8
    df = _clean_columns(pd.read_csv(path))
    df["Fertilizer Name"] = df["Fertilizer Name"].map(lambda s: FERT_SHORT.get(str(s).strip(), str(s).strip()))
    return df[NPK + ["Fertilizer Name"]].reset_index(drop=True), path


def load_fertilizer_full8(path=None):
    path = path or find_file(["Fertilizer Prediction.csv", "Fertilizer_Prediction.csv", "fertilizer_prediction.csv"])
    if path is None:
        os.makedirs("/content/data" if os.path.isdir("/content") else "data", exist_ok=True)
        target = os.path.join("/content/data" if os.path.isdir("/content") else "data", "Fertilizer Prediction.csv")
        import urllib.request
        urllib.request.urlretrieve(FERT8_URL, target)
        path = target
    df = _clean_columns(pd.read_csv(path))
    df["Fertilizer Name"] = df["Fertilizer Name"].map(lambda s: FERT_SHORT.get(str(s).strip(), str(s).strip()))
    for c in FERT8_CATEGORICAL:
        df[c] = df[c].astype(str).str.strip()
    return df[FERT8_NUMERIC + FERT8_CATEGORICAL + ["Fertilizer Name"]].reset_index(drop=True), path


def prepare(task, path=None, seed=0):
    """Returns X (DataFrame), y (int array), LabelEncoder, TaskSpec, data path."""
    if task == "crop":
        df, path = load_crop(path)
        target, numeric, categorical = "label", CROP_FEATURES, []
        metric, k_range, default_k, prefilter = "log_loss", (2, 14), 8, 16
    elif task == "fert_npk":
        df, path = load_fertilizer_npk(path)
        target, numeric, categorical = "Fertilizer Name", NPK, []
        metric, k_range, default_k, prefilter = "macro_f1", (1, 8), 4, 16
    elif task == "fert_full8":
        df, path = load_fertilizer_full8(path)
        target, numeric, categorical = "Fertilizer Name", FERT8_NUMERIC, FERT8_CATEGORICAL
        metric, k_range, default_k, prefilter = "macro_f1", (1, 8), 4, 16
    else:
        raise ValueError(task)
    le = LabelEncoder()
    y = le.fit_transform(df[target].values)
    X = df[numeric + categorical].copy()
    for c in numeric:
        X[c] = X[c].astype(float)
    cats = {c: sorted(X[c].unique().tolist()) for c in categorical}
    spec = TaskSpec(name=task, numeric=list(numeric), categorical=list(categorical), categories=cats,
                    primary_metric=metric, k_range=k_range, default_k=default_k, prefilter=prefilter,
                    seed=seed, n_rows=len(X), min_class_count=int(np.bincount(y).min()))
    return X, y, le, spec, path
