"""Quantum feature exploration: circuit families, readouts and the QuantumFeatureBank transformer."""
import hashlib
from collections import OrderedDict
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from .qsim import StateBatch, expval_1q, expval_2q

FAMILIES = ("separable", "angle_cnot", "iqp", "heisenberg", "reupload")
ENTANGLING = {"separable": False, "angle_cnot": True, "iqp": True, "heisenberg": True, "reupload": True}
_FAMILY_ID = {f: i for i, f in enumerate(FAMILIES)}


def make_config(family, scale=1.0, layers=1, readout="T1T2"):
    if family not in FAMILIES:
        raise ValueError(f"unknown family {family}")
    return {"family": family, "scale": float(scale), "layers": int(layers), "readout": readout}


def config_label(cfg):
    return f"{cfg['family']}[s={cfg['scale']:g},L={cfg['layers']}]"


def default_bank(n_qubits, size="standard"):
    """A broad, fixed (label-independent) bank so no exploration choice leaks test labels."""
    big = "T1T2" if n_qubits <= 8 else "T1"
    cfgs = [make_config("angle_cnot", s, 1, big) for s in (1.0, 1.5)]
    cfgs += [make_config("separable", s, 1, "T1") for s in (0.5, 1.0, 1.5, 2.0)]
    if size == "small":
        cfgs += [make_config("iqp", 1.0, 2, big), make_config("heisenberg", 1.0, 3, big),
                 make_config("reupload", 1.0, 3, big)]
        return cfgs
    cfgs += [make_config("iqp", s, 2, big) for s in (0.5, 1.0, 1.5)]
    cfgs += [make_config("heisenberg", s, 3, big) for s in (0.5, 1.0, 2.0)]
    cfgs += [make_config("reupload", s, 3, big) for s in (0.5, 1.0, 1.5)]
    return cfgs


def separable_bank():
    return [make_config("separable", s, 1, "T1") for s in (0.5, 1.0, 1.5, 2.0)]


def _edges(n):
    if n < 2:
        return []
    if n == 2:
        return [(0, 1)]
    return [(i, (i + 1) % n) for i in range(n)]


def _fixed_params(cfg, n, seed, shape):
    rng = np.random.default_rng([int(seed), n, _FAMILY_ID[cfg["family"]], cfg["layers"]])
    return rng.uniform(0, 2 * np.pi, size=shape)


def circuit_ops(cfg, a, seed=0):
    """Gate list for one config. a: (B, n) rotation angles. Each op = (name, args)."""
    B, n = a.shape
    fam, L = cfg["family"], cfg["layers"]
    ops = []
    if fam == "separable":
        for q in range(n):
            ops += [("RY", (a[:, q], q)), ("RZ", (a[:, q], q))]
    elif fam == "angle_cnot":
        for q in range(n):
            ops.append(("RY", (a[:, q], q)))
        for c, t in _edges(n):
            ops.append(("CNOT", (c, t)))
    elif fam == "iqp":
        for _ in range(L):
            for q in range(n):
                ops += [("H", (q,)), ("RZ", (a[:, q], q))]
            for i, j in combinations(range(n), 2):
                ops.append(("ISING", ("Z", a[:, i] * a[:, j], i, j)))
    elif fam == "heisenberg":
        w = _fixed_params(cfg, n, seed, (n, 3))
        for q in range(n):
            ops.append(("ROT", (w[q, 0], w[q, 1], w[q, 2], q)))
        for _ in range(L):
            for j, (c, t) in enumerate(_edges(n)):
                theta = a[:, j % n] / L
                for p in ("X", "Y", "Z"):
                    ops.append(("ISING", (p, theta, c, t)))
    elif fam == "reupload":
        w = _fixed_params(cfg, n, seed, (L, n, 3))
        for layer in range(L):
            for q in range(n):
                ops += [("RY", (a[:, q], q)), ("RZ", (a[:, q], q))]
            for q in range(n):
                ops.append(("ROT", (w[layer, q, 0], w[layer, q, 1], w[layer, q, 2], q)))
            for c, t in _edges(n):
                ops.append(("CNOT", (c, t)))
    return ops


def simulate(cfg, a, seed=0):
    sb = StateBatch(a.shape[0], a.shape[1])
    for name, args in circuit_ops(cfg, a, seed):
        getattr(sb, name)(*args)
    return sb


def readout_terms(readout, n):
    terms = []
    if "T1" in readout or readout == "full2":
        terms += [((p,), (q,)) for q in range(n) for p in "XYZ"]
    if "T2" in readout:
        terms += [((p, p), (i, j)) for i, j in combinations(range(n), 2) for p in "XYZ"]
    if readout == "full2":
        terms += [((p1, p2), (i, j)) for i, j in combinations(range(n), 2) for p1 in "XYZ" for p2 in "XYZ"]
    return terms


def term_name(term):
    paulis, wires = term
    return "".join(f"{p}{w}" for p, w in zip(paulis, wires))


def feature_names(cfg, n):
    lab = config_label(cfg)
    return [f"{lab}:{term_name(t)}" for t in readout_terms(cfg["readout"], n)]


def measure(sb, readout):
    n = sb.n
    cols, r1, r2 = [], {}, {}
    for paulis, wires in readout_terms(readout, n):
        if len(wires) == 1:
            if wires[0] not in r1:
                r1[wires[0]] = sb.rdm1(wires[0])
            cols.append(expval_1q(r1[wires[0]], paulis[0]))
        else:
            if wires not in r2:
                r2[wires] = sb.rdm2(*wires)
            cols.append(expval_2q(r2[wires], *paulis))
    return np.stack(cols, axis=1)


def to_angles(x_unit, scale):
    """x_unit in [-1, 1] -> rotation angles in [-scale*pi/2, scale*pi/2]."""
    return float(scale) * (np.pi / 2) * x_unit


def quantum_features(x_unit, cfg, seed=0, chunk=2048):
    out = []
    for s in range(0, x_unit.shape[0], chunk):
        a = to_angles(x_unit[s:s + chunk], cfg["scale"])
        out.append(measure(simulate(cfg, a, seed), cfg["readout"]))
    return np.vstack(out)


def quantum_states(x_unit, cfg, seed=0):
    return simulate(cfg, to_angles(x_unit, cfg["scale"]), seed).vector()


_CACHE = OrderedDict()
_CACHE_SIZE = 12


def _key(*parts):
    h = hashlib.sha1()
    for p in parts:
        h.update(p.tobytes() if isinstance(p, np.ndarray) else repr(p).encode())
    return h.hexdigest()


class QuantumFeatureBank(BaseEstimator, TransformerMixin):
    """Appends fixed-circuit quantum expectation features to the input columns.

    Columns in `quantum_cols` are min-max scaled to [-1, 1] (fit on training data only),
    encoded by every circuit config, and read out as Pauli expectation values.
    Output = [input columns (if passthrough), quantum features].
    """

    def __init__(self, configs=None, quantum_cols=None, passthrough=True, seed=0, chunk=2048, cache=True):
        self.configs = configs
        self.quantum_cols = quantum_cols
        self.passthrough = passthrough
        self.seed = seed
        self.chunk = chunk
        self.cache = cache

    def fit(self, X, y=None):
        X = np.asarray(X, dtype=float)
        self.n_features_in_ = X.shape[1]
        self.qcols_ = list(range(X.shape[1])) if self.quantum_cols is None else list(self.quantum_cols)
        Xq = X[:, self.qcols_]
        self.min_ = Xq.min(axis=0)
        span = Xq.max(axis=0) - self.min_
        self.span_ = np.where(span > 0, span, 1.0)
        n = len(self.qcols_)
        self.n_qubits_ = n
        self.configs_ = list(self.configs) if self.configs is not None else default_bank(n)
        self.quantum_names_ = [nm for c in self.configs_ for nm in feature_names(c, n)]
        self.n_passthrough_ = X.shape[1] if self.passthrough else 0
        return self

    def unit(self, X):
        X = np.asarray(X, dtype=float)
        return np.clip(2 * (X[:, self.qcols_] - self.min_) / self.span_ - 1, -1, 1)

    def transform(self, X):
        X = np.asarray(X, dtype=float)
        key = _key(X, self.min_, self.span_, self.configs_, self.seed) if self.cache else None
        if key is not None and key in _CACHE:
            _CACHE.move_to_end(key)
            Q = _CACHE[key]
        else:
            U = self.unit(X)
            Q = np.hstack([quantum_features(U, c, self.seed, self.chunk) for c in self.configs_])
            if key is not None:
                _CACHE[key] = Q
                while len(_CACHE) > _CACHE_SIZE:
                    _CACHE.popitem(last=False)
        return np.hstack([X, Q]) if self.passthrough else Q.copy()

    def get_feature_names_out(self, input_features=None):
        raw = list(input_features) if input_features is not None else [f"x{i}" for i in range(self.n_features_in_)]
        return np.array((raw if self.passthrough else []) + self.quantum_names_, dtype=object)


class RFFAugmenter(BaseEstimator, TransformerMixin):
    """Classical control: input columns + k random Fourier (RBF) features of the numeric columns."""

    def __init__(self, k=8, gamma=1.0, numeric_cols=None, seed=0):
        self.k = k
        self.gamma = gamma
        self.numeric_cols = numeric_cols
        self.seed = seed

    def fit(self, X, y=None):
        X = np.asarray(X, dtype=float)
        self.cols_ = list(range(X.shape[1])) if self.numeric_cols is None else list(self.numeric_cols)
        rng = np.random.default_rng(self.seed)
        d = len(self.cols_)
        self.W_ = rng.normal(scale=np.sqrt(2 * self.gamma / d), size=(d, int(self.k)))
        self.b_ = rng.uniform(0, 2 * np.pi, size=int(self.k))
        self.n_features_in_ = X.shape[1]
        return self

    def transform(self, X):
        X = np.asarray(X, dtype=float)
        return np.hstack([X, np.sqrt(2.0) * np.cos(X[:, self.cols_] @ self.W_ + self.b_)])


def _rbf(A, gamma):
    sq = (A ** 2).sum(1)
    D = np.maximum(sq[:, None] + sq[None, :] - 2 * A @ A.T, 0)
    return np.exp(-gamma * D)


def _norm_kernel(K):
    return K * (K.shape[0] / np.trace(K))


def geometric_difference(Kc, Kq, reg=1e-3):
    """Huang et al. 2021: g(K_C || K_Q) = sqrt(|| sqrt(Kq) (Kc + reg I)^-1 sqrt(Kq) ||_inf)."""
    Kc, Kq = _norm_kernel(Kc), _norm_kernel(Kq)
    w, V = np.linalg.eigh(Kq)
    sq = (V * np.sqrt(np.clip(w, 0, None))) @ V.T
    M = sq @ np.linalg.solve(Kc + reg * np.eye(len(Kc)), sq)
    return float(np.sqrt(np.max(np.abs(np.linalg.eigvalsh((M + M.T) / 2)))))


def effective_dimension(K):
    w = np.clip(np.linalg.eigvalsh(K), 0, None)
    return float(w.sum() ** 2 / (w ** 2).sum())


def kernel_target_alignment(K, y):
    Yo = (y[:, None] == np.unique(y)[None, :]).astype(float)
    Ky = Yo @ Yo.T
    return float((K * Ky).sum() / (np.linalg.norm(K) * np.linalg.norm(Ky)))


def explore_bank(X_num, y, configs, max_rows=500, seed=0):
    """Descriptive diagnostics per circuit config (exploration only, never used to pick the final model)."""
    X_num = np.asarray(X_num, dtype=float)
    y = np.asarray(y)
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(X_num), size=min(max_rows, len(X_num)), replace=False)
    Xs, ys = X_num[idx], y[idx]
    lo, span = Xs.min(0), np.where(np.ptp(Xs, 0) > 0, np.ptp(Xs, 0), 1)
    U = np.clip(2 * (Xs - lo) / span - 1, -1, 1)
    d = U.shape[1]
    Kc = _rbf(U, 1.0 / (d * U.var()))
    rows = []
    for cfg in configs:
        t1 = make_config(cfg["family"], cfg["scale"], cfg["layers"], "T1")
        F1 = quantum_features(U, t1, seed)
        bloch = F1.reshape(len(U), d, 3)
        purity = 0.5 * (1 + (bloch ** 2).sum(-1))
        Fall = quantum_features(U, cfg, seed)
        var = F1.var()
        Kq = _rbf(F1, 1.0 / (F1.shape[1] * var)) if var > 1e-12 else np.ones((len(U), len(U)))
        rows.append({
            "config": config_label(cfg), "family": cfg["family"], "scale": cfg["scale"],
            "layers": cfg["layers"], "entangling": ENTANGLING[cfg["family"]],
            "n_features": Fall.shape[1], "n_nonconstant": int((Fall.std(0) > 1e-6).sum()),
            "mean_1rdm_purity": float(purity.mean()),
            "pqk_effective_dim": effective_dimension(Kq),
            "geometric_difference_g": geometric_difference(Kc, Kq),
            "kta_quantum": kernel_target_alignment(Kq, ys),
            "kta_classical_rbf": kernel_target_alignment(Kc, ys),
        })
    return pd.DataFrame(rows)


def pennylane_reference(cfg, x_unit_rows, seed=0):
    """Same circuits in PennyLane (one sample at a time) for a correctness cross-check."""
    import pennylane as qml

    x_unit_rows = np.atleast_2d(x_unit_rows)
    n = x_unit_rows.shape[1]
    dev = qml.device("default.qubit", wires=n)
    terms = readout_terms(cfg["readout"], n)
    pl_gate = {"X": qml.PauliX, "Y": qml.PauliY, "Z": qml.PauliZ}

    def obs(term):
        paulis, wires = term
        o = pl_gate[paulis[0]](wires[0])
        for p, w in zip(paulis[1:], wires[1:]):
            o = o @ pl_gate[p](w)
        return o

    @qml.qnode(dev)
    def circuit(a):
        for name, args in circuit_ops(cfg, a[None, :], seed):
            if name == "RY":
                qml.RY(args[0][0], wires=args[1])
            elif name == "RZ":
                qml.RZ(args[0][0], wires=args[1])
            elif name == "RX":
                qml.RX(args[0][0], wires=args[1])
            elif name == "H":
                qml.Hadamard(wires=args[0])
            elif name == "ROT":
                qml.Rot(args[0], args[1], args[2], wires=args[3])
            elif name == "CNOT":
                qml.CNOT(wires=[args[0], args[1]])
            elif name == "ISING":
                gate = {"X": qml.IsingXX, "Y": qml.IsingYY, "Z": qml.IsingZZ}[args[0]]
                gate(args[1][0], wires=[args[2], args[3]])
        return [qml.expval(obs(t)) for t in terms]

    return np.array([np.array(circuit(to_angles(r, cfg["scale"]))) for r in x_unit_rows])


def draw_circuit(cfg, n, seed=0):
    import pennylane as qml

    dev = qml.device("default.qubit", wires=n)
    x = np.linspace(-0.8, 0.8, n)

    @qml.qnode(dev)
    def circuit(a):
        for name, args in circuit_ops(cfg, a[None, :], seed):
            if name in ("RY", "RZ", "RX"):
                getattr(qml, name)(args[0][0], wires=args[1])
            elif name == "H":
                qml.Hadamard(wires=args[0])
            elif name == "ROT":
                qml.Rot(args[0], args[1], args[2], wires=args[3])
            elif name == "CNOT":
                qml.CNOT(wires=[args[0], args[1]])
            elif name == "ISING":
                {"X": qml.IsingXX, "Y": qml.IsingYY, "Z": qml.IsingZZ}[args[0]](args[1][0], wires=[args[2], args[3]])
        return [qml.expval(qml.PauliZ(q)) for q in range(n)]

    fig, _ = qml.draw_mpl(circuit, decimals=1, style="pennylane")(to_angles(x, cfg["scale"]))
    return fig
