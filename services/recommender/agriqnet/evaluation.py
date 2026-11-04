"""Leak-free evaluation: nested CV with Optuna, corrected statistics, learning curves, missing-data
robustness, calibration, conformal sets and final-model selection."""
import os
import pickle
import time
import warnings

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import minimize_scalar
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, f1_score, log_loss,
                             top_k_accuracy_score)
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold, StratifiedShuffleSplit

from .models import ARMS, HYBRID_ARMS, build_pipeline, suggest_arm_params, suggest_model_params

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

HIGHER_IS_BETTER = {"accuracy": True, "macro_f1": True, "balanced_accuracy": True, "top3": True,
                    "log_loss": False, "ece": False}


def full_proba(model, X, n_classes):
    P = model.predict_proba(X)
    classes = getattr(model, "classes_", None)
    if classes is None:
        classes = model[-1].classes_
    out = np.zeros((len(P), n_classes))
    out[:, np.asarray(classes, dtype=int)] = P
    return out


def ece_score(y, P, bins=10):
    conf, pred = P.max(1), P.argmax(1)
    edges = np.linspace(0, 1, bins + 1)
    e = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            e += m.mean() * abs((pred[m] == y[m]).mean() - conf[m].mean())
    return float(e)


def metrics(y, P, n_classes):
    P = np.clip(P, 1e-12, 1)
    P = P / P.sum(1, keepdims=True)
    pred = P.argmax(1)
    labels = np.arange(n_classes)
    return {
        "accuracy": accuracy_score(y, pred),
        "macro_f1": f1_score(y, pred, average="macro", labels=np.unique(y), zero_division=0),
        "balanced_accuracy": balanced_accuracy_score(y, pred),
        "log_loss": log_loss(y, P, labels=labels),
        "top3": top_k_accuracy_score(y, P, k=min(3, n_classes - 1), labels=labels) if n_classes > 3 else np.nan,
        "ece": ece_score(y, P),
    }


def objective_value(y, P, n_classes, metric):
    return metrics(y, P, n_classes)[metric]


def outer_splits(y, n_splits, n_repeats, seed=0):
    rskf = RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=n_repeats, random_state=seed)
    return [(tr, te) for tr, te in rskf.split(np.zeros(len(y)), y)]


def cv_score(arm, model, params, X, y, spec, folds, seed, n_classes, metric):
    vals = []
    for tr, va in folds:
        pipe = build_pipeline(arm, model, params, spec, seed)
        pipe.fit(X.iloc[tr], y[tr])
        vals.append(objective_value(y[va], full_proba(pipe, X.iloc[va], n_classes), n_classes, metric))
    return float(np.mean(vals))


def tune(arm, model, X, y, spec, n_trials=20, inner_folds=3, seed=0, timeout=None):
    """Optuna TPE search over model + arm hyperparameters on inner stratified CV of (X, y)."""
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    n_classes = int(y.max()) + 1
    metric = spec.primary_metric
    hib = HIGHER_IS_BETTER[metric]
    folds = list(StratifiedKFold(inner_folds, shuffle=True, random_state=seed).split(np.zeros(len(y)), y))
    worst = -1e9 if hib else 1e9
    if model == "tabpfn":
        n_trials = min(n_trials, 6)

    def objective(trial):
        params = suggest_arm_params(trial, arm, spec)
        params.update(suggest_model_params(trial, "qsvm" if arm == "qsvm" else model, spec))
        try:
            return cv_score(arm, model, params, X, y, spec, folds, seed, n_classes, metric)
        except Exception as exc:
            trial.set_user_attr("error", repr(exc)[:200])
            return worst

    study = optuna.create_study(direction="maximize" if hib else "minimize",
                                sampler=optuna.samplers.TPESampler(seed=seed, multivariate=True))
    study.optimize(objective, n_trials=n_trials, timeout=timeout, show_progress_bar=False)
    return dict(study.best_params), float(study.best_value), study


def screen(X, y, spec, arms, models, n_splits=3, seed=0, verbose=True):
    """Fast first pass: default hyperparameters, plain stratified CV. Used only to shortlist model families."""
    n_classes = int(y.max()) + 1
    folds = list(StratifiedKFold(n_splits, shuffle=True, random_state=seed).split(np.zeros(len(y)), y))
    rows = []
    for model in models:
        for arm in arms:
            if arm == "qsvm" and model != models[0]:
                continue
            t0 = time.time()
            try:
                for i, (tr, te) in enumerate(folds):
                    pipe = build_pipeline(arm, "qsvm" if arm == "qsvm" else model, {}, spec, seed)
                    pipe.fit(X.iloc[tr], y[tr])
                    m = metrics(y[te], full_proba(pipe, X.iloc[te], n_classes), n_classes)
                    rows.append({"model": "qsvm" if arm == "qsvm" else model, "arm": arm, "split": i, **m})
            except Exception as exc:
                print(f"  ! {model}/{arm} failed: {exc!r}"[:200])
                continue
            if verbose:
                last = pd.DataFrame(rows[-len(folds):])
                print(f"  {model:10s} {arm:18s} {spec.primary_metric}={last[spec.primary_metric].mean():.4f}"
                      f"  acc={last['accuracy'].mean():.4f}  ({time.time() - t0:.1f}s)")
    return pd.DataFrame(rows)


def nested_item(X, y, spec, arm, model, split, si, n_trials=20, inner_folds=3, seed=0):
    """One unit of nested CV: tune (arm, model) on the outer-train part of split `si`, refit, score its outer-test part.
    Returns (row dict, (test_idx, probabilities), selected quantum-feature indices or None)."""
    n_classes = int(y.max()) + 1
    tr, te = split
    t0 = time.time()
    Xtr, ytr = X.iloc[tr], y[tr]
    params, inner, _ = tune(arm, model, Xtr, ytr, spec, n_trials, inner_folds, seed + si)
    pipe = build_pipeline(arm, model, params, spec, seed)
    pipe.fit(Xtr, ytr)
    P = full_proba(pipe, X.iloc[te], n_classes)
    m = metrics(y[te], P, n_classes)
    row = {"split": si, "arm": arm, "model": model, "inner_score": inner, "params": params, "k": params.get("k"),
           "fit_seconds": time.time() - t0, "n_train": len(tr), "n_test": len(te), **m}
    sel = pipe.named_steps["select"].selected_.tolist() if "select" in pipe.named_steps else None
    return row, (te, P), sel


def empty_state():
    return {"rows": [], "probas": {}, "done": set(), "selected": {}}


def add_item(state, key, row, proba, sel):
    state["rows"].append(row)
    state["probas"][key] = proba
    if sel is not None:
        state["selected"][key] = sel
    state["done"].add(key)


def nested_cv(X, y, spec, candidates, splits, n_trials=20, inner_folds=3, seed=0, checkpoint=None,
              verbose=True):
    """For every outer split and candidate (arm, model): tune on the outer-train part only, refit, score outer-test."""
    state = empty_state()
    if checkpoint and os.path.exists(checkpoint):
        state = pickle.load(open(checkpoint, "rb"))
        state.setdefault("selected", {})
        if verbose:
            print(f"  resumed {len(state['done'])} finished fits from checkpoint")
    for si, split in enumerate(splits):
        for arm, model in candidates:
            key = (arm, model, si)
            if key in state["done"]:
                continue
            try:
                row, proba, sel = nested_item(X, y, spec, arm, model, split, si, n_trials, inner_folds, seed)
                add_item(state, key, row, proba, sel)
                if verbose:
                    print(f"  split {si:2d} {model:10s} {arm:18s} {spec.primary_metric}={row[spec.primary_metric]:.4f}"
                          f" acc={row['accuracy']:.4f} ({row['fit_seconds']:.0f}s)")
            except Exception as exc:
                print(f"  ! split {si} {arm}/{model} failed: {exc!r}"[:240])
                state["done"].add(key)
            if checkpoint:
                pickle.dump(state, open(checkpoint, "wb"))
    return pd.DataFrame(state["rows"]), state


def corrected_ttest(a, b, test_train_ratio):
    """Nadeau & Bengio (2003) corrected resampled t-test on paired per-split scores a - b."""
    d = np.asarray(a, float) - np.asarray(b, float)
    J = len(d)
    if J < 2 or np.allclose(d.var(ddof=1), 0):
        return float(d.mean()), np.nan, (float(d.mean()), float(d.mean()))
    se = np.sqrt((1.0 / J + test_train_ratio) * d.var(ddof=1))
    t = d.mean() / se
    p = 2 * stats.t.sf(abs(t), df=J - 1)
    h = stats.t.ppf(0.975, J - 1) * se
    return float(d.mean()), float(p), (float(d.mean() - h), float(d.mean() + h))


def holm(pvals):
    p = np.asarray(pvals, float)
    out = np.full_like(p, np.nan)
    ok = ~np.isnan(p)
    idx = np.argsort(p[ok])
    m = ok.sum()
    adj = np.minimum(1, np.maximum.accumulate((m - np.arange(m)) * p[ok][idx]))
    tmp = np.empty(m)
    tmp[idx] = adj
    out[ok] = tmp
    return out


def summarize(df, metric, ratio):
    rows = []
    for (arm, model), g in df.groupby(["arm", "model"]):
        g = g.sort_values("split")
        v = g[metric].values
        se = np.sqrt((1.0 / len(v) + ratio) * v.var(ddof=1)) if len(v) > 1 else np.nan
        rows.append({"arm": arm, "model": model, "n_splits": len(v), f"{metric}_mean": v.mean(),
                     f"{metric}_corrected_se": se, "accuracy_mean": g["accuracy"].mean(),
                     "macro_f1_mean": g["macro_f1"].mean(), "log_loss_mean": g["log_loss"].mean(),
                     "top3_mean": g["top3"].mean(), "ece_mean": g["ece"].mean(),
                     "fit_seconds_mean": g["fit_seconds"].mean() if "fit_seconds" in g else np.nan,
                     "hybrid": arm in HYBRID_ARMS or arm.startswith("ensemble_hybrid")})
    out = pd.DataFrame(rows)
    return out.sort_values(f"{metric}_mean", ascending=not HIGHER_IS_BETTER[metric]).reset_index(drop=True)


def compare_to_baseline(df, metric, ratio, baseline="raw"):
    """Every arm vs the raw-feature arm of the same model family (paired by split), Holm-adjusted."""
    rows = []
    for model, g in df.groupby("model"):
        base = g[g.arm == baseline].set_index("split")[metric]
        for arm, h in g.groupby("arm"):
            if arm == baseline:
                continue
            h = h.set_index("split")[metric]
            common = base.index.intersection(h.index)
            if len(common) < 2:
                continue
            diff, p, ci = corrected_ttest(h[common], base[common], ratio)
            rows.append({"model": model, "arm": arm, "vs": baseline, "mean_diff": diff, "ci_low": ci[0],
                         "ci_high": ci[1], "p_corrected_t": p})
    out = pd.DataFrame(rows)
    if len(out):
        out["p_holm"] = holm(out["p_corrected_t"].values)
        hib = HIGHER_IS_BETTER[metric]
        out["verdict"] = np.where(out["p_holm"] < 0.05, np.where((out["mean_diff"] > 0) == hib, "better", "worse"),
                                  "no significant difference")
    return out


def soft_vote_results(state, members, y, n_splits_total, name):
    """Equal-weight soft vote of already-computed outer-test probabilities (no refitting)."""
    n_classes = int(y.max()) + 1
    rows = []
    for si in range(n_splits_total):
        Ps = [state["probas"].get((a, m, si)) for a, m in members]
        if any(p is None for p in Ps):
            continue
        te = Ps[0][0]
        P = np.mean([p[1] for p in Ps], axis=0)
        rows.append({"split": si, "arm": name, "model": "+".join(f"{m}:{a}" for a, m in members),
                     "fit_seconds": np.nan, **metrics(y[te], P, n_classes)})
    return pd.DataFrame(rows)


def choose_final(summary, metric, policy="hybrid_within_1se"):
    """1-SE rule. policy: 'hybrid_within_1se' | 'overall_best' | 'best_hybrid'."""
    hib = HIGHER_IS_BETTER[metric]
    col, se = f"{metric}_mean", f"{metric}_corrected_se"
    best = summary.iloc[0]
    hybrids = summary[summary.hybrid]
    if policy == "overall_best" or hybrids.empty:
        return best, "overall best by mean " + metric
    hbest = hybrids.iloc[0]
    if policy == "best_hybrid":
        return hbest, "best hybrid (policy forces a quantum stage)"
    tol = best[se] if np.isfinite(best[se]) else 0.0
    within = (hbest[col] >= best[col] - tol) if hib else (hbest[col] <= best[col] + tol)
    if hbest.name == best.name:
        return best, "the overall best candidate is a hybrid"
    if within:
        return hbest, (f"best hybrid is within 1 corrected SE of the overall best "
                       f"({hbest[col]:.4f} vs {best[col]:.4f}, SE {tol:.4f})")
    return best, (f"no hybrid within 1 SE (best hybrid {hbest[col]:.4f} vs best {best[col]:.4f}, "
                  f"SE {tol:.4f}); shipping the overall best")


def stratified_subsample(y, n, rng, per_class=None):
    classes = np.unique(y)
    if per_class is not None:
        return np.concatenate([rng.choice(np.where(y == c)[0], per_class, replace=False) for c in classes])
    first = np.array([rng.choice(np.where(y == c)[0]) for c in classes])
    rest = np.setdiff1d(np.arange(len(y)), first)
    extra = rng.choice(rest, size=max(0, n - len(first)), replace=False)
    return np.concatenate([first, extra])


def learning_curve(X, y, spec, entries, sizes, reps=20, seed=0, per_class=False, verbose=True):
    """entries: list of (label, arm, model, params). Same subsamples for every entry (paired design)."""
    n_classes = int(y.max()) + 1
    rows = []
    for n in sizes:
        t0 = time.time()
        rng = np.random.default_rng([int(seed), int(n)])
        for r in range(reps):
            idx = stratified_subsample(y, n, rng, per_class=n if per_class else None)
            test = np.setdiff1d(np.arange(len(y)), idx)
            for label, arm, model, params in entries:
                p = dict(params)
                if "k" in p:
                    p["k"] = int(min(p["k"], max(1, len(idx) // 2)))
                if model == "gnb":
                    p.setdefault("var_smoothing", 1e-2)
                if model == "knn":
                    p["n_neighbors"] = int(min(p.get("n_neighbors", 5), len(idx) - 1))
                try:
                    pipe = build_pipeline(arm, model, p, spec, seed)
                    if arm == "qsvm":
                        pipe.set_params(clf__probability=False)
                    pipe.fit(X.iloc[idx], y[idx])
                    pred = np.asarray(pipe.predict(X.iloc[test])).astype(int).ravel()
                    m = {"accuracy": accuracy_score(y[test], pred),
                         "macro_f1": f1_score(y[test], pred, average="macro", labels=np.unique(y[test]),
                                              zero_division=0)}
                    rows.append({"label": label, "arm": arm, "model": model, "size": n,
                                 "n_train": len(idx), "rep": r, "accuracy": m["accuracy"],
                                 "macro_f1": m["macro_f1"]})
                except Exception as exc:
                    rows.append({"label": label, "arm": arm, "model": model, "size": n, "n_train": len(idx),
                                 "rep": r, "accuracy": np.nan, "macro_f1": np.nan, "error": repr(exc)[:120]})
        if verbose:
            d = pd.DataFrame(rows)
            d = d[d["size"] == n].groupby("label")["accuracy"].mean()
            print(f"  n={n}: " + "  ".join(f"{k}={v:.3f}" for k, v in d.items()) + f"  ({time.time() - t0:.0f}s)")
    return pd.DataFrame(rows)


def paired_wilcoxon(df, base_label, value="accuracy"):
    rows = []
    for n, g in df.groupby("size"):
        base = g[g.label == base_label].set_index("rep")[value]
        for lab, h in g.groupby("label"):
            if lab == base_label:
                continue
            h = h.set_index("rep")[value]
            c = base.index.intersection(h.index)
            d = (h[c] - base[c]).dropna()
            p = stats.wilcoxon(d).pvalue if (d != 0).sum() >= 5 else np.nan
            rows.append({"size": n, "label": lab, "vs": base_label, "mean_diff": d.mean(), "p_wilcoxon": p})
    out = pd.DataFrame(rows)
    if len(out):
        out["p_holm"] = holm(out["p_wilcoxon"].values)
    return out


def missing_data_experiment(X, y, spec, entries, rates, reps=10, imputers=("mean", "iterative"),
                            test_size=0.3, seed=0, mask_cols=None, verbose=True):
    """Train on complete data; at test time hide numeric soil readings completely at random (MCAR)."""
    n_classes = int(y.max()) + 1
    mask_cols = list(mask_cols or spec.numeric)
    sss = StratifiedShuffleSplit(n_splits=reps, test_size=test_size, random_state=seed)
    rng = np.random.default_rng(seed)
    rows = []
    for r, (tr, te) in enumerate(sss.split(np.zeros(len(y)), y)):
        masks = {p: rng.random((len(te), len(mask_cols))) < p for p in rates}
        for imp in imputers:
            for label, arm, model, params in entries:
                try:
                    pipe = build_pipeline(arm, model, params, spec, seed, imputer=imp)
                    pipe.fit(X.iloc[tr], y[tr])
                except Exception as exc:
                    print(f"  ! {label}/{imp}: {exc!r}"[:160])
                    continue
                for p in rates:
                    Xm = X.iloc[te].copy()
                    vals = Xm[mask_cols].values.astype(float)
                    vals[masks[p]] = np.nan
                    Xm[mask_cols] = vals
                    P = full_proba(pipe, Xm, n_classes)
                    pred = np.asarray(pipe.predict(Xm)).astype(int).ravel()
                    rows.append({"label": label, "imputer": imp, "rate": p, "rep": r,
                                 "accuracy": accuracy_score(y[te], pred),
                                 "macro_f1": f1_score(y[te], pred, average="macro", labels=np.unique(y[te]),
                                                      zero_division=0),
                                 "log_loss": metrics(y[te], P, n_classes)["log_loss"]})
        if verbose and (r + 1) % max(1, reps // 5) == 0:
            print(f"  missing-data repeat {r + 1}/{reps} done")
    return pd.DataFrame(rows)


def oof_probabilities(make_pipe, X, y, n_splits=5, seed=0):
    n_classes = int(y.max()) + 1
    P = np.zeros((len(y), n_classes))
    for tr, te in StratifiedKFold(n_splits, shuffle=True, random_state=seed).split(np.zeros(len(y)), y):
        pipe = make_pipe()
        pipe.fit(X.iloc[tr], y[tr])
        P[te] = full_proba(pipe, X.iloc[te], n_classes)
    return P


def apply_temperature(P, T):
    L = np.log(np.clip(P, 1e-12, 1)) / T
    L -= L.max(1, keepdims=True)
    E = np.exp(L)
    return E / E.sum(1, keepdims=True)


def fit_temperature(P, y):
    """One temperature on out-of-fold probabilities, bounded to [0.25, 4] so near-perfect OOF predictions
    on tiny data cannot collapse every confidence to 1.0."""
    n_classes = P.shape[1]
    res = minimize_scalar(lambda T: log_loss(y, apply_temperature(P, T), labels=np.arange(n_classes)),
                          bounds=(0.25, 4.0), method="bounded")
    return float(res.x)


def conformal_threshold(P, y, alpha=0.1):
    """Split/cross-conformal LAC score 1 - p_true; set = {c : 1 - p_c <= qhat} has ~(1 - alpha) coverage."""
    s = 1 - P[np.arange(len(y)), y]
    n = len(s)
    q = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
    return float(np.quantile(s, q, method="higher"))


def conformal_sets(P, qhat):
    """Classes whose score passes the threshold; the top-1 class is always included (never an empty set)."""
    out = []
    for row in P:
        s = set(np.where(1 - row <= qhat)[0].tolist()) | {int(np.argmax(row))}
        out.append(np.array(sorted(s, key=lambda c: -row[c])))
    return out
