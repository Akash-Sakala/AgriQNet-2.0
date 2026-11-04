"""Quantum feature selection: Mücke et al. (2023) relevance-redundancy QUBO with alpha-bisection,
solved exactly (small M) or by simulated annealing (dwave-samplers), plus classical selector controls
and a QAOA demonstration.

QUBO energy for a binary selection vector x over candidate quantum features:
    E(x) = -alpha * sum_i I_i x_i + (1 - alpha) * [ sum_{i<j} R_ij x_i x_j + sum_i x_i sum_r R_ir ]
I_i  = normalised mutual information with the label (relevance)
R_ij = |Spearman rho| between candidates (redundancy); R_ir couples a candidate to the
       raw features that are always kept ("forced"), so quantum features that duplicate raw ones are penalised.
alpha is bisected so that the minimiser selects exactly k features (Mücke et al., QMI 5:11, 2023).
"""
import hashlib
from collections import OrderedDict

import numpy as np
from scipy.stats import rankdata
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.feature_selection import mutual_info_classif

_STATS_CACHE = OrderedDict()


def _hash(*arrs):
    h = hashlib.sha1()
    for a in arrs:
        h.update(np.ascontiguousarray(a).tobytes() if isinstance(a, np.ndarray) else repr(a).encode())
    return h.hexdigest()


def abs_spearman(A, B=None):
    Ra = rankdata(A, axis=0)
    Ra = (Ra - Ra.mean(0)) / (Ra.std(0) + 1e-12)
    if B is None:
        C = (Ra.T @ Ra) / len(A)
    else:
        Rb = rankdata(B, axis=0)
        Rb = (Rb - Rb.mean(0)) / (Rb.std(0) + 1e-12)
        C = (Ra.T @ Rb) / len(A)
    return np.clip(np.abs(C), 0, 1)


def binned_mutual_info(X, y, n_bins=None):
    """Plug-in MI (nats) between each quantile-binned column of X and discrete y (Mücke et al. use binning)."""
    X = np.asarray(X, dtype=float)
    n = len(y)
    classes, yc = np.unique(y, return_inverse=True)
    C = len(classes)
    if n_bins is None:
        n_bins = int(np.clip(np.sqrt(n / C), 3, 10))
    ranks = rankdata(X, axis=0, method="average")
    codes = np.minimum(((ranks - 1) * n_bins / n).astype(int), n_bins - 1)
    py = np.bincount(yc, minlength=C) / n
    out = np.empty(X.shape[1])
    for j in range(X.shape[1]):
        joint = np.bincount(codes[:, j] * C + yc, minlength=n_bins * C).reshape(n_bins, C) / n
        px = joint.sum(1, keepdims=True)
        nz = joint > 0
        out[j] = float((joint[nz] * np.log(joint[nz] / (px @ py[None, :])[nz])).sum())
    return out


def candidate_statistics(X, y, n_forced, prefilter=20, dedup=0.98, mi_neighbors="binned", seed=0):
    """Variance filter -> MI relevance -> greedy de-duplication -> top-M prefilter. Cached per data."""
    key = _hash(X, y, n_forced, prefilter, dedup, mi_neighbors, seed)
    if key in _STATS_CACHE:
        _STATS_CACHE.move_to_end(key)
        return _STATS_CACHE[key]
    Xf, Xc = X[:, :n_forced], X[:, n_forced:]
    keep = np.where(Xc.std(0) > 1e-6)[0]
    if mi_neighbors in (None, 0, "binned"):
        mi = binned_mutual_info(Xc[:, keep], y)
    else:
        nn = int(max(1, min(mi_neighbors, np.unique(y, return_counts=True)[1].min() - 1)))
        mi = mutual_info_classif(Xc[:, keep], y, n_neighbors=nn, random_state=seed)
    order = keep[np.argsort(-mi)]
    mi_sorted = np.sort(mi)[::-1]
    pool = order[: max(4 * prefilter, prefilter + 10)]
    pool_mi = mi_sorted[: len(pool)]
    R_pool = abs_spearman(Xc[:, pool])
    chosen = []
    for i in range(len(pool)):
        if all(R_pool[i, j] < dedup for j in chosen):
            chosen.append(i)
        if len(chosen) >= prefilter:
            break
    cand = pool[chosen]
    rel = pool_mi[chosen]
    rel = rel / rel.max() if rel.max() > 0 else rel
    R = R_pool[np.ix_(chosen, chosen)]
    np.fill_diagonal(R, 0.0)
    if n_forced > 0:
        num_forced = [c for c in range(n_forced) if np.unique(Xf[:, c]).size > 2]
        Rf = abs_spearman(Xc[:, cand], Xf[:, num_forced]).sum(1) if num_forced else np.zeros(len(cand))
    else:
        Rf = np.zeros(len(cand))
    stats = {"cand": cand + n_forced, "rel": rel, "R": R, "Rf": Rf}
    _STATS_CACHE[key] = stats
    while len(_STATS_CACHE) > 64:
        _STATS_CACHE.popitem(last=False)
    return stats


def qubo_terms(rel, R, Rf, alpha):
    h = -alpha * rel + (1 - alpha) * Rf
    J = (1 - alpha) * np.triu(R, 1)
    return h, J


def energy(x, h, J):
    x = np.atleast_2d(x).astype(float)
    return x @ h + np.einsum("bi,ij,bj->b", x, J, x)


def solve_exact(h, J, chunk=1 << 15):
    M = len(h)
    if M > 22:
        raise ValueError("exact solver limited to 22 variables")
    best_e, best_x = np.inf, None
    bits = (1 << np.arange(M))[::-1]
    for start in range(0, 1 << M, chunk):
        idx = np.arange(start, min(start + chunk, 1 << M))
        B = ((idx[:, None] & bits) > 0).astype(float)
        e = energy(B, h, J)
        i = int(np.argmin(e))
        if e[i] < best_e:
            best_e, best_x = float(e[i]), B[i].astype(int)
    return best_x, best_e


def solve_sa(h, J, num_reads=64, num_sweeps=1000, seed=0, sampler="sa"):
    from dwave.samplers import SimulatedAnnealingSampler, TabuSampler

    M = len(h)
    Q = {(i, i): float(h[i]) for i in range(M)}
    for i in range(M):
        for j in range(i + 1, M):
            if J[i, j] != 0:
                Q[(i, j)] = float(J[i, j])
    if sampler == "tabu":
        ss = TabuSampler().sample_qubo(Q, num_reads=max(4, num_reads // 8), seed=seed)
    else:
        ss = SimulatedAnnealingSampler().sample_qubo(Q, num_reads=num_reads, num_sweeps=num_sweeps, seed=seed)
    rec = ss.first
    x = np.array([rec.sample[i] for i in range(M)], dtype=int)
    return x, float(rec.energy)


def solve(h, J, solver="auto", seed=0, num_reads=64):
    if solver == "exact" or (solver == "auto" and len(h) <= 16):
        return solve_exact(h, J)
    return solve_sa(h, J, num_reads=num_reads, seed=seed, sampler="tabu" if solver == "tabu" else "sa")


def qubo_select(rel, R, Rf, k, solver="auto", seed=0, num_reads=64, max_iter=30):
    """Bisection on alpha until the QUBO minimiser selects exactly k features."""
    M = len(rel)
    k = int(min(max(k, 0), M))
    if k == 0:
        return np.zeros(M, dtype=int), 0.0, {"iterations": 0}
    lo, hi = 0.0, 1.0
    best = None
    for it in range(max_iter):
        alpha = 0.5 * (lo + hi)
        x, e = solve(*qubo_terms(rel, R, Rf, alpha), solver=solver, seed=seed + it, num_reads=num_reads)
        s = int(x.sum())
        if best is None or abs(s - k) < abs(best[0].sum() - k):
            best = (x.copy(), alpha)
        if s == k:
            return x, alpha, {"iterations": it + 1, "exact_k": True}
        if s < k:
            lo = alpha
        else:
            hi = alpha
    x, alpha = best
    h, J = qubo_terms(rel, R, Rf, alpha)
    Jf = J + J.T
    while x.sum() > k:
        on = np.where(x == 1)[0]
        gain = h[on] + Jf[on] @ x - 0
        x[on[np.argmax(gain)]] = 0
    while x.sum() < k:
        off = np.where(x == 0)[0]
        cost = h[off] + Jf[off] @ x
        x[off[np.argmin(cost)]] = 1
    return x, alpha, {"iterations": max_iter, "exact_k": False}


class _BaseSelector(BaseEstimator, TransformerMixin):
    def transform(self, X):
        return np.asarray(X, dtype=float)[:, self.support_]

    def _finish(self, X, picked):
        self.n_features_in_ = X.shape[1]
        self.selected_ = np.array(sorted(int(i) for i in picked), dtype=int)
        self.support_ = np.concatenate([np.arange(self.n_forced), self.selected_]).astype(int)
        return self


class QUBOSelector(_BaseSelector):
    """Keeps the first `n_forced` columns (raw features) and picks `k` quantum features via the QUBO."""

    def __init__(self, k=6, n_forced=0, prefilter=20, dedup=0.98, solver="auto", mi_neighbors="binned",
                 num_reads=64, random_state=0):
        self.k = k
        self.n_forced = n_forced
        self.prefilter = prefilter
        self.dedup = dedup
        self.solver = solver
        self.mi_neighbors = mi_neighbors
        self.num_reads = num_reads
        self.random_state = random_state

    def fit(self, X, y):
        X = np.asarray(X, dtype=float)
        st = candidate_statistics(X, np.asarray(y), self.n_forced, self.prefilter, self.dedup,
                                  self.mi_neighbors, self.random_state)
        x, alpha, info = qubo_select(st["rel"], st["R"], st["Rf"], self.k, self.solver,
                                     self.random_state, self.num_reads)
        self.alpha_, self.solver_info_ = alpha, info
        return self._finish(X, st["cand"][x.astype(bool)])


class MISelector(_BaseSelector):
    """Control: top-k quantum features by mutual information (relevance only)."""

    def __init__(self, k=6, n_forced=0, prefilter=20, dedup=0.98, mi_neighbors="binned", random_state=0):
        self.k, self.n_forced, self.prefilter, self.dedup = k, n_forced, prefilter, dedup
        self.mi_neighbors, self.random_state = mi_neighbors, random_state

    def fit(self, X, y):
        X = np.asarray(X, dtype=float)
        st = candidate_statistics(X, np.asarray(y), self.n_forced, self.prefilter, self.dedup,
                                  self.mi_neighbors, self.random_state)
        return self._finish(X, st["cand"][np.argsort(-st["rel"])[: self.k]])


class MRMRSelector(_BaseSelector):
    """Control: classical greedy mRMR (relevance minus mean redundancy) on the same candidates."""

    def __init__(self, k=6, n_forced=0, prefilter=20, dedup=0.98, mi_neighbors="binned", random_state=0):
        self.k, self.n_forced, self.prefilter, self.dedup = k, n_forced, prefilter, dedup
        self.mi_neighbors, self.random_state = mi_neighbors, random_state

    def fit(self, X, y):
        X = np.asarray(X, dtype=float)
        st = candidate_statistics(X, np.asarray(y), self.n_forced, self.prefilter, self.dedup,
                                  self.mi_neighbors, self.random_state)
        rel, R, Rf = st["rel"], st["R"], st["Rf"]
        nf = max(1, self.n_forced)
        chosen = []
        for _ in range(min(self.k, len(rel))):
            red = (R[:, chosen].sum(1) + Rf) / (len(chosen) + nf)
            score = rel - red
            score[chosen] = -np.inf
            chosen.append(int(np.argmax(score)))
        return self._finish(X, st["cand"][chosen])


class RandomSelector(_BaseSelector):
    """Control: k random quantum features (lower bound for any selector)."""

    def __init__(self, k=6, n_forced=0, random_state=0):
        self.k, self.n_forced, self.random_state = k, n_forced, random_state

    def fit(self, X, y):
        X = np.asarray(X, dtype=float)
        rng = np.random.default_rng(self.random_state)
        pool = np.where(X[:, self.n_forced:].std(0) > 1e-6)[0] + self.n_forced
        return self._finish(X, rng.choice(pool, size=min(self.k, len(pool)), replace=False))


def qaoa_demo(rel, R, Rf, alpha, layers=2, steps=80, stepsize=0.05, seed=0):
    """Solve the alpha-fixed QUBO with QAOA on PennyLane's simulator and compare to the exact optimum."""
    import pennylane as qml
    from pennylane import numpy as pnp

    h, J = qubo_terms(rel, R, Rf, alpha)
    M = len(h)
    coeffs, ops = [], []
    lin = h / 2 + (J + J.T).sum(1) / 4
    for i in range(M):
        coeffs.append(-lin[i])
        ops.append(qml.PauliZ(i))
    for i in range(M):
        for j in range(i + 1, M):
            if J[i, j] != 0:
                coeffs.append(J[i, j] / 4)
                ops.append(qml.PauliZ(i) @ qml.PauliZ(j))
    cost_h = qml.Hamiltonian(coeffs, ops)
    mixer_h = qml.qaoa.x_mixer(range(M))
    dev = qml.device("default.qubit", wires=M)

    def layer(gamma, beta):
        qml.qaoa.cost_layer(gamma, cost_h)
        qml.qaoa.mixer_layer(beta, mixer_h)

    def ansatz(params):
        for w in range(M):
            qml.Hadamard(wires=w)
        qml.layer(layer, layers, params[0], params[1])

    @qml.qnode(dev)
    def cost(params):
        ansatz(params)
        return qml.expval(cost_h)

    @qml.qnode(dev)
    def probs(params):
        ansatz(params)
        return qml.probs(wires=range(M))

    rng = np.random.default_rng(seed)
    params = pnp.array(rng.uniform(0, 0.5, size=(2, layers)), requires_grad=True)
    opt = qml.AdamOptimizer(stepsize)
    history = []
    for _ in range(steps):
        params, c = opt.step_and_cost(cost, params)
        history.append(float(c))
    p = np.array(probs(params))
    bits = ((np.arange(2 ** M)[:, None] >> np.arange(M)[::-1]) & 1).astype(float)
    energies = energy(bits, h, J)
    x_exact = bits[np.argmin(energies)]
    top = np.argsort(-p)[:5]
    x_qaoa = bits[top[np.argmin(energies[top])]]
    e_min, e_max = energies.min(), energies.max()
    return {
        "x_qaoa": x_qaoa.astype(int), "x_exact": x_exact.astype(int),
        "e_qaoa": float(energy(x_qaoa, h, J)[0]), "e_exact": float(e_min),
        "approx_ratio": float((e_max - energy(x_qaoa, h, J)[0]) / (e_max - e_min + 1e-12)),
        "p_optimal": float(p[np.argmin(energies)]), "expected_energy_history": history,
        "match": bool(np.array_equal(x_qaoa, x_exact)),
    }


def nogueira_stability(masks):
    """Nogueira, Sechidis & Brown (JMLR 2018) stability of a set of binary selection masks (rows)."""
    Z = np.asarray(masks, dtype=float)
    M, d = Z.shape
    if M < 2:
        return np.nan
    kbar = Z.sum(1).mean()
    p = Z.mean(0)
    s2 = M / (M - 1) * p * (1 - p)
    denom = (kbar / d) * (1 - kbar / d)
    return float(1 - s2.mean() / denom) if denom > 0 else np.nan
