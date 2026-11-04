"""Budgets, shortlisting and the final refit -> AgriQNetRecommender."""
import numpy as np
import pandas as pd

from .evaluation import (HIGHER_IS_BETTER, apply_temperature, conformal_sets, conformal_threshold,
                         fit_temperature, metrics, oof_probabilities, soft_vote_results, summarize, tune)
from .models import HYBRID_ARMS
from .models import build_pipeline, selected_feature_names
from .persistence import AgriQNetRecommender

BUDGETS = {
    "quick": {"crop": dict(outer=(3, 1), inner=3, trials=6, shortlist=2, lc_reps=4, md_reps=3),
              "fert": dict(outer=(3, 2), inner=3, trials=8, shortlist=2, lc_reps=8, md_reps=4)},
    "standard": {"crop": dict(outer=(5, 1), inner=3, trials=15, shortlist=3, lc_reps=10, md_reps=6),
                 "fert": dict(outer=(3, 5), inner=3, trials=25, shortlist=3, lc_reps=30, md_reps=15)},
    "full": {"crop": dict(outer=(5, 2), inner=3, trials=30, shortlist=4, lc_reps=20, md_reps=10),
             "fert": dict(outer=(3, 10), inner=3, trials=40, shortlist=4, lc_reps=40, md_reps=25)},
}


def shortlist_models(screen_df, metric, n=3, exclude=("qsvm",)):
    """Rank model families by the better of their raw / hybrid screening score."""
    d = screen_df[~screen_df.model.isin(exclude)]
    m = d.groupby(["model", "arm"])[metric].mean().reset_index()
    best = m.groupby("model")[metric].max() if HIGHER_IS_BETTER[metric] else m.groupby("model")[metric].min()
    return list(best.sort_values(ascending=not HIGHER_IS_BETTER[metric]).index[:n])


def add_ensembles(results, state, y, n_splits, metric, ratio, size=3):
    """Equal-weight soft votes of the top-`size` single candidates overall and of the top hybrids."""
    base = summarize(results, metric, ratio)
    base = base[~base.arm.str.startswith("ensemble")]
    out = [results]
    top_all = [(r.arm, r.model) for r in base.head(size).itertuples()]
    hyb = base[base.arm.isin(HYBRID_ARMS)]
    top_h = [(r.arm, r.model) for r in hyb.head(size).itertuples()]
    if len(top_all) >= 2:
        name = "ensemble_hybrid_top" if all(a in HYBRID_ARMS for a, _ in top_all) else "ensemble_top"
        out.append(soft_vote_results(state, top_all, y, n_splits, f"{name}{len(top_all)}"))
    if len(top_h) >= 2 and top_h != top_all:
        out.append(soft_vote_results(state, top_h, y, n_splits, f"ensemble_hybrid_top{len(top_h)}"))
    return pd.concat(out, ignore_index=True)


def candidate_key(row):
    if str(row["arm"]).startswith("ensemble"):
        return [tuple(x.split(":")[::-1]) for x in row["model"].split("+")]
    return [(row["arm"], row["model"])]


def fit_final_recommender(members, X, y, spec, label_names, n_trials=20, inner_folds=3, seed=0,
                          cal_folds=5, alpha=0.1, description=""):
    """Re-tune each member on ALL data, refit, then fit temperature + conformal threshold on OOF predictions."""
    n_classes = int(y.max()) + 1
    cal_folds = int(min(cal_folds, np.bincount(y).min()))
    fitted, params_all, names = [], {}, {}
    for arm, model in members:
        params, inner, _ = tune(arm, model, X, y, spec, n_trials, inner_folds, seed)
        pipe = build_pipeline(arm, model, params, spec, seed).fit(X, y)
        fitted.append(pipe)
        params_all[f"{model}:{arm}"] = {"params": params, "inner_cv": inner}
        names[f"{model}:{arm}"] = selected_feature_names(pipe, spec) if arm != "qsvm" else ["quantum kernel on " + ", ".join(spec.numeric)]
    oof = np.mean([oof_probabilities(lambda a=a, m=m: build_pipeline(a, m, params_all[f"{m}:{a}"]["params"], spec, seed),
                                     X, y, cal_folds, seed) for a, m in members], axis=0)
    T = fit_temperature(oof, y)
    oof_T = apply_temperature(oof, T)
    qhat = conformal_threshold(oof_T, y, alpha)
    sets = conformal_sets(oof_T, qhat)
    cover = float(np.mean([y[i] in s for i, s in enumerate(sets)]))
    rec = AgriQNetRecommender(fitted, label_names, list(X.columns), temperature=T, qhat=qhat, alpha=alpha,
                              task=spec.name, description=description, selected_features=names)
    info = {"members": [f"{m}:{a}" for a, m in members], "params": params_all, "temperature": T,
            "conformal_qhat": qhat, "oof_metrics_before_T": metrics(y, oof, n_classes),
            "oof_metrics_after_T": metrics(y, oof_T, n_classes), "oof_conformal_coverage": cover,
            "oof_mean_set_size": float(np.mean([len(s) for s in sets])), "oof_proba": oof, "oof_proba_T": oof_T}
    return rec, info


def selection_frequency(state, arm, model, feature_names, n_forced):
    sel = state.get("selected", {})
    counts, n = {}, 0
    for (a, m, si), idx in sel.items():
        if a == arm and m == model:
            n += 1
            for i in idx:
                counts[feature_names[i]] = counts.get(feature_names[i], 0) + 1
    if n == 0:
        return pd.Series(dtype=float)
    return (pd.Series(counts) / n).sort_values(ascending=False)
