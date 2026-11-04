"""One reloadable artifact: the AgriQNetRecommender (pipelines + calibration + conformal threshold) and a manifest."""
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from importlib import metadata

import joblib
import numpy as np
import pandas as pd

from .evaluation import apply_temperature, conformal_sets

TRACKED = ["numpy", "scipy", "scikit-learn", "pandas", "pennylane", "pennylane-lightning", "dwave-samplers",
           "optuna", "xgboost", "lightgbm", "catboost", "tabpfn", "tabpfn-extensions", "torch", "joblib"]


class AgriQNetRecommender:
    """Averages member pipelines' probabilities, applies temperature scaling, returns top-k and a conformal set."""

    def __init__(self, members, label_names, input_columns, temperature=1.0, qhat=None, alpha=0.1,
                 task="", description="", selected_features=None):
        self.members = members
        self.label_names = list(label_names)
        self.input_columns = list(input_columns)
        self.temperature = float(temperature)
        self.qhat = qhat
        self.alpha = alpha
        self.task = task
        self.description = description
        self.selected_features = selected_features or {}

    def _frame(self, X):
        if isinstance(X, pd.DataFrame):
            return X[self.input_columns]
        return pd.DataFrame(np.atleast_2d(X), columns=self.input_columns)

    def predict_proba(self, X):
        X = self._frame(X)
        n = len(self.label_names)
        Ps = []
        for pipe in self.members:
            P = pipe.predict_proba(X)
            full = np.zeros((len(P), n))
            full[:, np.asarray(pipe.classes_, dtype=int)] = P
            Ps.append(full)
        return apply_temperature(np.mean(Ps, axis=0), self.temperature)

    def predict(self, X):
        return np.array(self.label_names)[self.predict_proba(X).argmax(1)]

    def recommend(self, X, top=3):
        P = self.predict_proba(X)
        sets = conformal_sets(P, self.qhat) if self.qhat is not None else [[]] * len(P)
        rows = []
        for i, row in enumerate(P):
            order = np.argsort(-row)[:top]
            rows.append({
                "recommendation": self.label_names[order[0]],
                "confidence": round(float(row[order[0]]), 4),
                f"top{top}": ", ".join(f"{self.label_names[j]} ({row[j]:.2f})" for j in order),
                f"conformal_set_{int(round((1 - self.alpha) * 100))}%": ", ".join(self.label_names[j] for j in sets[i]),
            })
        return pd.DataFrame(rows)


def versions():
    out = {"python": platform.python_version(), "platform": platform.platform()}
    for pkg in TRACKED:
        try:
            out[pkg] = metadata.version(pkg)
        except Exception:
            out[pkg] = None
    try:
        import torch
        out["cuda"] = torch.version.cuda
        out["gpu"] = torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    except Exception:
        pass
    return out


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def save_artifact(recommender, out_dir, manifest, sample_X, package_dir=None):
    os.makedirs(out_dir, exist_ok=True)
    joblib.dump(recommender, os.path.join(out_dir, "model.joblib"), compress=3)
    sample = recommender._frame(sample_X)
    sample.to_csv(os.path.join(out_dir, "sample_input.csv"), index=False)
    np.save(os.path.join(out_dir, "sample_proba.npy"), recommender.predict_proba(sample))
    manifest = dict(manifest)
    manifest.update({"saved_at": time.strftime("%Y-%m-%d %H:%M:%S"), "versions": versions(),
                     "input_columns": recommender.input_columns, "labels": recommender.label_names,
                     "temperature": recommender.temperature, "conformal_qhat": recommender.qhat,
                     "conformal_alpha": recommender.alpha})
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2, default=_json_default)
    pkg = package_dir or os.path.dirname(os.path.abspath(__file__))
    dst = os.path.join(out_dir, "agriqnet")
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(pkg, dst, ignore=shutil.ignore_patterns("__pycache__"))
    return out_dir


def load_artifact(out_dir):
    out_dir = os.path.abspath(out_dir)
    if out_dir not in sys.path:
        sys.path.insert(0, out_dir)
    return joblib.load(os.path.join(out_dir, "model.joblib"))


def verify_reload(out_dir, atol=1e-9):
    """Loads the artifact in a fresh Python process and checks predictions are identical."""
    code = (
        "import sys, numpy as np, pandas as pd, joblib;"
        f"sys.path.insert(0, {os.path.abspath(out_dir)!r});"
        f"m = joblib.load({os.path.join(os.path.abspath(out_dir), 'model.joblib')!r});"
        f"X = pd.read_csv({os.path.join(os.path.abspath(out_dir), 'sample_input.csv')!r});"
        f"P = np.load({os.path.join(os.path.abspath(out_dir), 'sample_proba.npy')!r});"
        "d = float(np.abs(m.predict_proba(X) - P).max()); print(d)"
    )
    res = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                         cwd=os.path.abspath(out_dir))
    if res.returncode != 0:
        raise RuntimeError(res.stderr[-2000:])
    diff = float(res.stdout.strip().splitlines()[-1])
    return diff <= atol, diff
