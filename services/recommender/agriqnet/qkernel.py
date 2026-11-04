"""Bandwidth-tuned quantum fidelity-kernel SVM (the Capstone_v2 fertilizer model, generalised)."""
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.svm import SVC

from .feature_maps import make_config, quantum_states
from .qsim import fidelity_kernel


class QuantumKernelSVC(BaseEstimator, ClassifierMixin):
    """SVC on K(x,x') = |<psi(x)|psi(x')>|^2 * exp(-gamma_other * ||z - z'||^2).

    psi encodes the `quantum_cols` (min-max scaled to [-1, 1] on training data) with the chosen circuit
    family and bandwidth `scale`; z are the remaining (e.g. one-hot categorical) columns.
    """

    def __init__(self, family="angle_cnot", scale=1.5, layers=1, C=1.0, quantum_cols=None,
                 gamma_other=0.5, probability=True, class_weight=None, seed=0):
        self.family = family
        self.scale = scale
        self.layers = layers
        self.C = C
        self.quantum_cols = quantum_cols
        self.gamma_other = gamma_other
        self.probability = probability
        self.class_weight = class_weight
        self.seed = seed

    def _unit(self, X):
        return np.clip(2 * (X[:, self.qcols_] - self.min_) / self.span_ - 1, -1, 1)

    def _kernel(self, X):
        S = quantum_states(self._unit(X), self.cfg_, self.seed)
        K = fidelity_kernel(S, self.states_)
        if self.ocols_:
            Z = X[:, self.ocols_]
            D = ((Z[:, None, :] - self.Z_[None, :, :]) ** 2).sum(-1)
            K = K * np.exp(-self.gamma_other * D)
        return K

    def fit(self, X, y):
        X = np.asarray(X, dtype=float)
        self.n_features_in_ = X.shape[1]
        self.qcols_ = list(range(X.shape[1])) if self.quantum_cols is None else list(self.quantum_cols)
        self.ocols_ = [c for c in range(X.shape[1]) if c not in self.qcols_]
        Xq = X[:, self.qcols_]
        self.min_ = Xq.min(0)
        span = Xq.max(0) - self.min_
        self.span_ = np.where(span > 0, span, 1.0)
        self.cfg_ = make_config(self.family, self.scale, self.layers, "T1")
        self.states_ = quantum_states(self._unit(X), self.cfg_, self.seed)
        self.Z_ = X[:, self.ocols_] if self.ocols_ else None
        K = fidelity_kernel(self.states_, self.states_)
        if self.ocols_:
            D = ((self.Z_[:, None, :] - self.Z_[None, :, :]) ** 2).sum(-1)
            K = K * np.exp(-self.gamma_other * D)
        self.svc_ = SVC(kernel="precomputed", C=self.C, probability=self.probability,
                        class_weight=self.class_weight, random_state=self.seed).fit(K, y)
        self.classes_ = self.svc_.classes_
        return self

    def predict(self, X):
        return self.svc_.predict(self._kernel(np.asarray(X, dtype=float)))

    def predict_proba(self, X):
        return self.svc_.predict_proba(self._kernel(np.asarray(X, dtype=float)))

    def decision_function(self, X):
        return self.svc_.decision_function(self._kernel(np.asarray(X, dtype=float)))
