"""Classical model zoo, Optuna search spaces, experiment arms and pipeline builder."""
import os
import warnings
from dataclasses import dataclass, field

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.experimental import enable_iterative_imputer  # noqa: F401
from sklearn.impute import IterativeImputer, SimpleImputer
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC

from .feature_maps import QuantumFeatureBank, RFFAugmenter, default_bank, separable_bank
from .qkernel import QuantumKernelSVC
from .selection import MISelector, MRMRSelector, QUBOSelector, RandomSelector


N_JOBS = int(os.environ.get("AGRIQNET_N_JOBS", "-1"))


def has_cuda():
    try:
        import torch
        return bool(torch.cuda.is_available())
    except Exception:
        return False


def available_models():
    out = ["logreg", "svm_rbf", "knn", "gnb", "rf", "extratrees"]
    for mod, name in (("xgboost", "xgb"), ("lightgbm", "lgbm"), ("catboost", "catboost"), ("tabpfn", "tabpfn")):
        try:
            __import__(mod)
            out.append(name)
        except Exception:
            pass
    return out


@dataclass
class TaskSpec:
    name: str
    numeric: list
    categorical: list = field(default_factory=list)
    categories: dict = field(default_factory=dict)
    primary_metric: str = "log_loss"
    k_range: tuple = (2, 12)
    default_k: int = 6
    prefilter: int = 16
    bank: list = None
    seed: int = 0
    n_rows: int = 0
    min_class_count: int = 0

    @property
    def n_numeric(self):
        return len(self.numeric)

    @property
    def n_prep_out(self):
        return len(self.numeric) + sum(len(self.categories[c]) for c in self.categorical)

    @property
    def small(self):
        return self.n_rows < 300

    def bank_configs(self):
        return self.bank if self.bank is not None else default_bank(self.n_numeric)


def make_preprocessor(spec, imputer="iterative"):
    if imputer == "iterative":
        imp = IterativeImputer(max_iter=25, random_state=spec.seed, sample_posterior=False)
    else:
        imp = SimpleImputer(strategy=imputer)
    num = Pipeline([("impute", imp), ("scale", StandardScaler())])
    parts = [("num", num, list(spec.numeric))]
    if spec.categorical:
        cats = [list(spec.categories[c]) for c in spec.categorical]
        parts.append(("cat", OneHotEncoder(categories=cats, handle_unknown="ignore", sparse_output=False),
                      list(spec.categorical)))
    return ColumnTransformer(parts, remainder="drop", verbose_feature_names_out=False)


class TabPFNWrapper(BaseEstimator, ClassifierMixin):
    """TabPFN-2 (Apache-2.0 weights, no token). >10 classes use the tabpfn-extensions ECOC wrapper."""

    def __init__(self, n_estimators=8, device="auto", seed=0):
        self.n_estimators = n_estimators
        self.device = device
        self.seed = seed

    def fit(self, X, y):
        from tabpfn import TabPFNClassifier
        from tabpfn.constants import ModelVersion

        dev = ("cuda" if has_cuda() else "cpu") if self.device == "auto" else self.device
        base = TabPFNClassifier.create_default_for_version(
            ModelVersion.V2, device=dev, n_estimators=int(self.n_estimators), random_state=self.seed,
            ignore_pretraining_limits=True)
        self.classes_ = np.unique(y)
        if len(self.classes_) > 10:
            from tabpfn_extensions.many_class import ManyClassClassifier
            est = ManyClassClassifier(base, alphabet_size=10, random_state=self.seed)
        else:
            est = base
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            est.fit(np.asarray(X, dtype=np.float32), y)
        self.est_ = est
        return self

    def predict_proba(self, X):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            p = self.est_.predict_proba(np.asarray(X, dtype=np.float32))
        out = np.zeros((len(p), len(self.classes_)))
        pos = {c: i for i, c in enumerate(self.classes_)}
        for j, c in enumerate(self.est_.classes_):
            out[:, pos[c]] = p[:, j]
        return out

    def predict(self, X):
        return self.classes_[np.argmax(self.predict_proba(X), axis=1)]


def _max_features(v):
    return {"0.5": 0.5, "1.0": 1.0}.get(v, v)


def make_model(name, p, spec, seed=0):
    p = dict(p)
    gpu = has_cuda()
    if name == "logreg":
        return Pipeline([("sc", StandardScaler()), ("m", LogisticRegression(
            C=p.get("C", 1.0), class_weight=p.get("class_weight"), max_iter=5000))])
    if name == "svm_rbf":
        return Pipeline([("sc", StandardScaler()), ("m", SVC(
            C=p.get("C", 10.0), gamma=p.get("gamma", "scale"), class_weight=p.get("class_weight"),
            probability=True, random_state=seed))])
    if name == "knn":
        return Pipeline([("sc", StandardScaler()), ("m", KNeighborsClassifier(
            n_neighbors=p.get("n_neighbors", 5), weights=p.get("weights", "distance")))])
    if name == "gnb":
        return GaussianNB(var_smoothing=p.get("var_smoothing", 1e-9))
    if name in ("rf", "extratrees"):
        cls = RandomForestClassifier if name == "rf" else ExtraTreesClassifier
        return cls(n_estimators=p.get("n_estimators", 300), max_depth=p.get("max_depth"),
                   min_samples_leaf=p.get("min_samples_leaf", 1),
                   max_features=_max_features(p.get("max_features", "sqrt")),
                   class_weight=p.get("class_weight"), n_jobs=N_JOBS, random_state=seed)
    if name == "xgb":
        from xgboost import XGBClassifier
        return XGBClassifier(
            n_estimators=p.get("n_estimators", 200), max_depth=p.get("max_depth", 4),
            learning_rate=p.get("learning_rate", 0.1), subsample=p.get("subsample", 0.9),
            colsample_bytree=p.get("colsample_bytree", 0.9), min_child_weight=p.get("min_child_weight", 1.0),
            reg_lambda=p.get("reg_lambda", 1.0), tree_method="hist",
            device="cuda" if gpu and os.environ.get("AGRIQNET_XGB_DEVICE", "auto") != "cpu" else "cpu",
            eval_metric="mlogloss", n_jobs=N_JOBS, random_state=seed, verbosity=0)
    if name == "lgbm":
        from lightgbm import LGBMClassifier
        return LGBMClassifier(
            n_estimators=p.get("n_estimators", 200), num_leaves=p.get("num_leaves", 15),
            learning_rate=p.get("learning_rate", 0.1), min_child_samples=p.get("min_child_samples", 3 if spec.small else 10),
            subsample=p.get("subsample", 0.9), subsample_freq=1, colsample_bytree=p.get("colsample_bytree", 0.9),
            reg_lambda=p.get("reg_lambda", 1.0), class_weight=p.get("class_weight"),
            random_state=seed, n_jobs=N_JOBS, verbose=-1)
    if name == "catboost":
        from catboost import CatBoostClassifier
        return CatBoostClassifier(
            iterations=p.get("iterations", 300), depth=p.get("depth", 4 if spec.small else 6),
            learning_rate=p.get("learning_rate", 0.1), l2_leaf_reg=p.get("l2_leaf_reg", 3.0),
            auto_class_weights=p.get("auto_class_weights"), random_seed=seed, verbose=0,
            allow_writing_files=False, thread_count=N_JOBS)
    if name == "tabpfn":
        return TabPFNWrapper(n_estimators=p.get("n_estimators", 8), seed=seed)
    raise ValueError(f"unknown model {name}")


def suggest_model_params(trial, name, spec):
    s = spec.small
    if name == "logreg":
        return {"C": trial.suggest_float("C", 1e-3, 1e3, log=True),
                "class_weight": trial.suggest_categorical("class_weight", [None, "balanced"])}
    if name == "svm_rbf":
        return {"C": trial.suggest_float("C", 1e-2, 1e3, log=True),
                "gamma": trial.suggest_float("gamma", 1e-4, 10.0, log=True),
                "class_weight": trial.suggest_categorical("class_weight", [None, "balanced"])}
    if name == "knn":
        hi = int(max(2, min(25, spec.min_class_count // 2 if s else 25)))
        return {"n_neighbors": trial.suggest_int("n_neighbors", 1, hi),
                "weights": trial.suggest_categorical("weights", ["uniform", "distance"])}
    if name == "gnb":
        return {"var_smoothing": trial.suggest_float("var_smoothing", 1e-12, 1e-1, log=True)}
    if name in ("rf", "extratrees"):
        return {"n_estimators": trial.suggest_int("n_estimators", 100, 500, step=100),
                "max_depth": trial.suggest_int("max_depth", 2, 12 if s else 30),
                "min_samples_leaf": trial.suggest_int("min_samples_leaf", 1, 4 if s else 8),
                "max_features": trial.suggest_categorical("max_features", ["sqrt", "log2", "0.5", "1.0"]),
                "class_weight": trial.suggest_categorical("class_weight", [None, "balanced"])}
    if name == "xgb":
        return {"n_estimators": trial.suggest_int("n_estimators", 50, 400, step=50),
                "max_depth": trial.suggest_int("max_depth", 2, 6 if s else 10),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
                "min_child_weight": trial.suggest_float("min_child_weight", 0.01 if s else 0.1, 10.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True)}
    if name == "lgbm":
        return {"n_estimators": trial.suggest_int("n_estimators", 50, 400, step=50),
                "num_leaves": trial.suggest_int("num_leaves", 3, 15 if s else 63),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
                "min_child_samples": trial.suggest_int("min_child_samples", 1 if s else 5, 8 if s else 40),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
                "class_weight": trial.suggest_categorical("class_weight", [None, "balanced"])}
    if name == "catboost":
        return {"iterations": trial.suggest_int("iterations", 100, 500, step=100),
                "depth": trial.suggest_int("depth", 2, 6 if s else 8),
                "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.3, log=True),
                "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1.0, 10.0, log=True),
                "auto_class_weights": trial.suggest_categorical("auto_class_weights", [None, "Balanced"])}
    if name == "tabpfn":
        return {"n_estimators": trial.suggest_categorical("n_estimators", [4, 8])}
    if name == "qsvm":
        return {"family": trial.suggest_categorical("family", ["angle_cnot", "iqp", "separable", "reupload"]),
                "scale": trial.suggest_float("scale", 0.25, 2.5),
                "C": trial.suggest_float("C", 1e-2, 1e3, log=True)}
    raise ValueError(name)


ARMS = {
    "raw": "Raw features only (classical baseline)",
    "hybrid_qubo": "Raw + k quantum features chosen by the QUBO selector (AgriQNet hybrid)",
    "hybrid_all": "Raw + the whole quantum bank (no selection)",
    "ctrl_mrmr": "Raw + k quantum features chosen by classical mRMR (selector control)",
    "ctrl_mi": "Raw + top-k quantum features by mutual information (selector control)",
    "ctrl_random": "Raw + k random quantum features (selector floor)",
    "ctrl_rff": "Raw + k random Fourier features (classical nonlinear-expansion control)",
    "ablation_separable": "Raw + QUBO-selected features from non-entangling circuits only (entanglement ablation)",
    "qsvm": "Quantum fidelity-kernel SVM with tuned bandwidth (v2 model, own learner)",
}
HYBRID_ARMS = ("hybrid_qubo", "hybrid_all", "ablation_separable", "qsvm")
K_ARMS = ("hybrid_qubo", "ctrl_mrmr", "ctrl_mi", "ctrl_random", "ctrl_rff", "ablation_separable")


def suggest_arm_params(trial, arm, spec):
    p = {}
    if arm in K_ARMS:
        p["k"] = trial.suggest_int("k", spec.k_range[0], spec.k_range[1])
    if arm == "ctrl_rff":
        p["rff_gamma"] = trial.suggest_float("rff_gamma", 0.05, 5.0, log=True)
    return p


def build_pipeline(arm, model, params, spec, seed=0, imputer="iterative"):
    p = dict(params)
    k = int(p.pop("k", spec.default_k))
    rff_gamma = p.pop("rff_gamma", 1.0)
    qcols = list(range(spec.n_numeric))
    n_forced = spec.n_prep_out
    steps = [("prep", make_preprocessor(spec, imputer))]
    sel = dict(k=k, n_forced=n_forced, prefilter=spec.prefilter, random_state=seed)
    if arm == "qsvm":
        steps.append(("clf", QuantumKernelSVC(quantum_cols=qcols, family=p.get("family", "angle_cnot"),
                                              scale=p.get("scale", 1.5), C=p.get("C", 1.0), seed=seed)))
        return Pipeline(steps)
    if arm in ("hybrid_qubo", "hybrid_all", "ctrl_mrmr", "ctrl_mi", "ctrl_random"):
        steps.append(("qbank", QuantumFeatureBank(configs=spec.bank_configs(), quantum_cols=qcols, seed=seed)))
    if arm == "ablation_separable":
        steps.append(("qbank", QuantumFeatureBank(configs=separable_bank(), quantum_cols=qcols, seed=seed)))
    if arm in ("hybrid_qubo", "ablation_separable"):
        steps.append(("select", QUBOSelector(**sel)))
    elif arm == "ctrl_mrmr":
        steps.append(("select", MRMRSelector(k=k, n_forced=n_forced, prefilter=spec.prefilter, random_state=seed)))
    elif arm == "ctrl_mi":
        steps.append(("select", MISelector(k=k, n_forced=n_forced, prefilter=spec.prefilter, random_state=seed)))
    elif arm == "ctrl_random":
        steps.append(("select", RandomSelector(k=k, n_forced=n_forced, random_state=seed)))
    elif arm == "ctrl_rff":
        steps.append(("rff", RFFAugmenter(k=k, gamma=rff_gamma, numeric_cols=qcols, seed=seed)))
    steps.append(("clf", make_model(model, p, spec, seed)))
    return Pipeline(steps)


def selected_feature_names(pipe, spec):
    """Names of the columns the classifier sees (raw + chosen quantum features) for a fitted pipeline."""
    raw = list(spec.numeric) + [f"{c}={v}" for c in spec.categorical for v in spec.categories[c]]
    if "qbank" not in pipe.named_steps:
        return raw
    names = list(pipe.named_steps["qbank"].get_feature_names_out(raw))
    if "select" in pipe.named_steps:
        return [names[i] for i in pipe.named_steps["select"].support_]
    return names
