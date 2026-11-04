"""End-to-end study for one task. Each method is one notebook stage; outputs go to run_dir/<task>/."""
import json
import os
import time

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from . import plots
from .data import file_sha256, prepare
from .evaluation import (HIGHER_IS_BETTER, choose_final, compare_to_baseline, learning_curve,
                         missing_data_experiment, nested_cv, outer_splits, paired_wilcoxon, screen, summarize)
from .feature_maps import (FAMILIES, QuantumFeatureBank, draw_circuit, explore_bank, make_config,
                           pennylane_reference, quantum_features)
from .final import BUDGETS, add_ensembles, candidate_key, fit_final_recommender, selection_frequency, shortlist_models
from .models import ARMS, available_models, has_cuda, make_preprocessor
from .persistence import save_artifact, verify_reload, versions
from .selection import (MRMRSelector, QUBOSelector, candidate_statistics, nogueira_stability, qaoa_demo,
                        qubo_select)


def lc_sizes_for(task):
    return [1, 2, 3, 5, 8, 16, 32] if task == "crop" else [8, 12, 16, 24, 32, 48, 64]


class Study:
    def __init__(self, task, run_dir, budget="standard", models=None, seed=0, policy="hybrid_within_1se",
                 data_path=None, verbose=True, resume=False):
        self.task, self.seed, self.policy, self.verbose = task, seed, policy, verbose
        self.X, self.y, self.le, self.spec, self.data_path = prepare(task, data_path, seed)
        self.kind = "crop" if task == "crop" else "fert"
        self.budget_name = budget
        self.budget = BUDGETS[budget][self.kind]
        avail = available_models()
        default = ["logreg", "svm_rbf", "knn", "gnb", "rf", "extratrees", "xgb", "lgbm", "catboost", "tabpfn"]
        if self.kind == "crop" and not has_cuda():
            default.remove("tabpfn")
        self.models = [m for m in (models or default) if m in avail]
        self.dir = os.path.join(run_dir, task)
        os.makedirs(self.dir, exist_ok=True)
        self.metric = self.spec.primary_metric
        self.results = {"task": task, "budget": budget, "metric": self.metric, "seed": seed,
                        "data_path": self.data_path, "data_sha256": file_sha256(self.data_path),
                        "n_rows": len(self.y), "n_classes": int(self.y.max()) + 1, "models": self.models,
                        "timings_s": {}}
        rpath = os.path.join(self.dir, "results.json")
        if resume and os.path.exists(rpath):
            prev = json.load(open(rpath))
            prev.update({k: v for k, v in self.results.items() if k not in ("timings_s",)})
            self.results = prev
            self.results.setdefault("timings_s", {})
            if "shortlist" in prev:
                self.shortlist = prev["shortlist"]
        plots.style()

    def _save(self, fig, name):
        fig.savefig(os.path.join(self.dir, name))
        return fig

    def _table(self, df, name):
        df.to_csv(os.path.join(self.dir, name), index=False)
        return df

    def _tick(self, stage, t0):
        self.results["timings_s"][stage] = round(time.time() - t0, 1)
        self.dump()

    def dump(self):
        with open(os.path.join(self.dir, "results.json"), "w") as f:
            json.dump(self.results, f, indent=2, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))

    def overview(self):
        counts = pd.Series(self.le.inverse_transform(self.y)).value_counts()
        print(f"{self.task}: {len(self.y)} rows, {len(counts)} classes, numeric={self.spec.numeric}, "
              f"categorical={self.spec.categorical}")
        print(f"models: {self.models}\nbudget: {self.budget_name} {self.budget}\nGPU: {has_cuda()}")
        corr = self.X[self.spec.numeric].corr()
        fig, ax = plt.subplots(figsize=(1 + 0.8 * len(corr), 0.8 * len(corr)))
        import seaborn as sns
        sns.heatmap(corr, annot=True, fmt=".2f", cmap="RdBu_r", vmin=-1, vmax=1, square=True, ax=ax, cbar=False)
        ax.set_title(f"{self.task}: numeric feature correlations", loc="left")
        self._save(fig, "00_correlations.png")
        return counts.to_frame("rows")

    def check_simulator(self, n_rows=5, atol=1e-10):
        """Asserts the batched NumPy simulator equals PennyLane default.qubit for every family."""
        t0 = time.time()
        n = self.spec.n_numeric
        rng = np.random.default_rng(self.seed)
        U = rng.uniform(-1, 1, (n_rows, n))
        rows = []
        for fam in FAMILIES:
            cfg = make_config(fam, 1.3, 2, "T1T2")
            d = float(np.abs(quantum_features(U, cfg, self.seed) - pennylane_reference(cfg, U, self.seed)).max())
            rows.append({"family": fam, "max_abs_diff_vs_pennylane": d, "ok": d < atol})
        df = pd.DataFrame(rows)
        assert df.ok.all(), df
        self.results["simulator_check"] = df.to_dict("records")
        for fam in FAMILIES:
            fig = draw_circuit(make_config(fam, 1.0, 1 if fam in ("angle_cnot", "separable") else 2), n, self.seed)
            self._save(fig, f"circuit_{fam}.png")
            plt.close(fig)
        self._tick("check_simulator", t0)
        return df

    def explore(self):
        t0 = time.time()
        cfgs = self.spec.bank_configs()
        bank = QuantumFeatureBank(configs=cfgs, quantum_cols=list(range(self.spec.n_numeric)))
        prep = make_preprocessor(self.spec).fit(self.X)
        Xp = prep.transform(self.X)
        F = bank.fit(Xp).transform(Xp)
        nq = F.shape[1] - Xp.shape[1]
        ex = explore_bank(Xp[:, : self.spec.n_numeric], self.y, cfgs, max_rows=500, seed=self.seed)
        self._table(ex, "01_exploration.csv")
        self._save(plots.exploration_heatmaps(ex), "01_exploration_heatmaps.png")
        self.results["bank"] = {"n_configs": len(cfgs), "n_quantum_features": int(nq),
                                "n_qubits": self.spec.n_numeric,
                                "n_nonconstant": int((F[:, Xp.shape[1]:].std(0) > 1e-6).sum())}
        self.bank_names = list(bank.get_feature_names_out(self._raw_names()))
        self._F_full, self._n_raw = F, Xp.shape[1]
        self._tick("explore", t0)
        return ex

    def _raw_names(self):
        return list(self.spec.numeric) + [f"{c}={v}" for c in self.spec.categorical for v in self.spec.categories[c]]

    def qubo_walkthrough(self, ks=None, qaoa_vars=10, qaoa_k=3):
        """Illustration on the full data (not used for model selection): QUBO picks, mRMR picks, and QAOA vs exact."""
        t0 = time.time()
        F, nr, y = self._F_full, self._n_raw, self.y
        ks = ks or [2, 4, self.spec.default_k]
        rows = []
        for k in ks:
            q = QUBOSelector(k=k, n_forced=nr, prefilter=self.spec.prefilter, random_state=self.seed).fit(F, y)
            m = MRMRSelector(k=k, n_forced=nr, prefilter=self.spec.prefilter, random_state=self.seed).fit(F, y)
            rows.append({"k": k, "alpha": round(q.alpha_, 4), "exact_k": q.solver_info_.get("exact_k"),
                         "qubo_features": [self.bank_names[i] for i in q.selected_],
                         "mrmr_features": [self.bank_names[i] for i in m.selected_],
                         "overlap": len(set(q.selected_) & set(m.selected_))})
        walk = pd.DataFrame(rows)
        st = candidate_statistics(F, y, nr, self.spec.prefilter, 0.98, "binned", self.seed)
        top = np.argsort(-st["rel"])[:qaoa_vars]
        rel, R, Rf = st["rel"][top], st["R"][np.ix_(top, top)], st["Rf"][top]
        _, alpha, _ = qubo_select(rel, R, Rf, qaoa_k, solver="exact")
        qa = qaoa_demo(rel, R, Rf, alpha, layers=2, steps=80, seed=self.seed)
        self._save(plots.qaoa_history(qa["expected_energy_history"], qa["e_exact"],
                                      f"QAOA on a {qaoa_vars}-variable feature-selection QUBO"), "02_qaoa.png")
        self.results["qaoa_demo"] = {k: v for k, v in qa.items() if k != "expected_energy_history"}
        self.results["qaoa_demo"]["variables"] = [self.bank_names[st["cand"][i]] for i in top]
        self._table(walk, "02_qubo_walkthrough.csv")
        self._tick("qubo_walkthrough", t0)
        return walk, qa

    def screen(self, arms=("raw", "hybrid_qubo", "qsvm")):
        t0 = time.time()
        df = screen(self.X, self.y, self.spec, list(arms), self.models, n_splits=3, seed=self.seed,
                    verbose=self.verbose)
        self._table(df, "03_screening.csv")
        self.shortlist = shortlist_models(df, self.metric, self.budget["shortlist"])
        self.results["shortlist"] = self.shortlist
        self._tick("screen", t0)
        agg = df.groupby(["model", "arm"])[[self.metric, "accuracy"]].mean().reset_index()
        return agg.sort_values(self.metric, ascending=not HIGHER_IS_BETTER[self.metric])

    def plan(self, controls=("ctrl_rff", "ctrl_mrmr", "ablation_separable")):
        """Outer splits and (arm, model) candidates for nested CV; deterministic given task, budget, seed, shortlist."""
        best = self.shortlist[0]
        self.candidates = ([(a, m) for m in self.shortlist for a in ("raw", "hybrid_qubo")]
                           + [(a, best) for a in controls] + [("qsvm", "qsvm")])
        self.splits = outer_splits(self.y, *self.budget["outer"], seed=self.seed)
        return [(si, a, m) for si in range(len(self.splits)) for a, m in self.candidates]

    def nested(self, controls=("ctrl_rff", "ctrl_mrmr", "ablation_separable"), checkpoint=True):
        t0 = time.time()
        self.plan(controls)
        ck = os.path.join(self.dir, "nested_checkpoint.pkl") if checkpoint else None
        res, state = nested_cv(self.X, self.y, self.spec, self.candidates, self.splits, self.budget["trials"],
                               self.budget["inner"], self.seed, ck, self.verbose)
        out = self.ingest(res, state)
        self._tick("nested", t0)
        return out

    def ingest(self, res, state):
        """Accepts nested-CV results computed here or by parallel workers and builds the summary tables."""
        if not hasattr(self, "splits"):
            self.plan()
        self.ratio = self.splits[0][1].size / self.splits[0][0].size
        self.nested_raw, self.state = res, state
        self.all_results = add_ensembles(res, state, self.y, len(self.splits), self.metric, self.ratio)
        self.summary = summarize(self.all_results, self.metric, self.ratio)
        self._table(self.all_results.drop(columns=["params"], errors="ignore"), "04_nested_cv_per_split.csv")
        self._table(self.summary, "04_nested_cv_summary.csv")
        self.dump()
        return self.summary

    def _bank_meta(self):
        prep = make_preprocessor(self.spec).fit(self.X)
        Xp = prep.transform(self.X)
        bank = QuantumFeatureBank(configs=self.spec.bank_configs(), quantum_cols=list(range(self.spec.n_numeric)))
        bank.fit(Xp)
        self.bank_names = list(bank.get_feature_names_out(self._raw_names()))
        self._n_raw = Xp.shape[1]

    def analyze(self):
        hib = HIGHER_IS_BETTER[self.metric]
        cmp = compare_to_baseline(self.nested_raw, self.metric, self.ratio)
        self._table(cmp, "05_vs_raw_corrected_ttest.csv")
        f1 = plots.candidate_strip(self.all_results, self.metric, f"{self.task}: nested-CV {self.metric} by candidate",
                                   higher_is_better=hib)
        self._save(f1, "05_candidates.png")
        if len(cmp):
            self._save(plots.forest(cmp, f"{self.task}: each arm minus raw features ({self.metric})"),
                       "05_vs_raw_forest.png")
        best = self.shortlist[0]
        if not hasattr(self, "bank_names"):
            self._bank_meta()
        names = self.bank_names
        freq = selection_frequency(self.state, "hybrid_qubo", best, names, self._n_raw)
        if len(freq):
            self._save(plots.selection_frequency(freq, f"{self.task}: quantum features chosen by the QUBO ({best})"),
                       "05_selection_frequency.png")
        masks = []
        for (a, m, si), idx in self.state.get("selected", {}).items():
            if a == "hybrid_qubo" and m == best:
                z = np.zeros(len(names))
                z[idx] = 1
                masks.append(z[self._n_raw:])
        stab = nogueira_stability(masks) if len(masks) > 1 else np.nan
        self.choice, self.choice_reason = choose_final(self.summary, self.metric, self.policy)
        self.results.update({
            "summary_top": self.summary.head(8).to_dict("records"),
            "vs_raw": cmp.to_dict("records") if len(cmp) else [],
            "qubo_selection_frequency_top": freq.head(10).round(3).to_dict() if len(freq) else {},
            "qubo_selection_stability_nogueira": stab,
            "final_choice": {"arm": self.choice["arm"], "model": self.choice["model"], "reason": self.choice_reason},
        })
        self.dump()
        return cmp, self.choice_reason

    def _lc_entries(self, params=None):
        best = self.shortlist[0]
        k = {"k": self.spec.default_k}
        e = [(f"raw:{best}", "raw", best, {}), (f"hybrid_qubo:{best}", "hybrid_qubo", best, k),
             (f"ctrl_rff:{best}", "ctrl_rff", best, k), (f"ablation_separable:{best}", "ablation_separable", best, k),
             ("qsvm", "qsvm", "qsvm", {"family": "angle_cnot", "scale": 1.5, "C": 10.0})]
        if best != "svm_rbf":
            e += [("raw:svm_rbf", "raw", "svm_rbf", {}), ("hybrid_qubo:svm_rbf", "hybrid_qubo", "svm_rbf", k)]
        return e

    def lc_sizes(self):
        return lc_sizes_for(self.task)

    def learning_curves(self, sizes=None, precomputed=None):
        """precomputed: a learning-curve table produced by parallel workers (same seeds, so identical results)."""
        t0 = time.time()
        per_class = self.kind == "crop"
        sizes = sizes or self.lc_sizes()
        if precomputed is not None:
            lc = precomputed
        else:
            lc = learning_curve(self.X, self.y, self.spec, self._lc_entries(), sizes, self.budget["lc_reps"],
                                self.seed, per_class, self.verbose)
        self._table(lc, "06_learning_curves.csv")
        tests = []
        for base in [lab for lab in lc.label.unique() if lab.startswith("raw:")]:
            fam = base.split(":")[1]
            sub = lc[lc.label.str.endswith(":" + fam) | ((lc.label == "qsvm") & (fam == self.shortlist[0]))]
            tests.append(paired_wilcoxon(sub, base, "accuracy"))
        tests = pd.concat(tests, ignore_index=True) if tests else pd.DataFrame()
        self._table(tests, "06_learning_curve_wilcoxon.csv")
        self._save(plots.learning_curves(lc, "accuracy", f"{self.task}: low-data learning curves", xlabel="total training samples"),
                   "06_learning_curves.png")
        g = lc.groupby(["label", "size"]).accuracy.mean().unstack()
        self.results["learning_curve_mean_accuracy"] = g.round(4).to_dict()
        self.results["learning_curve_tests"] = tests.to_dict("records")
        self._tick("learning_curves", t0)
        return g, tests

    def missing_data(self, rates=(0.1, 0.2, 0.3, 0.4, 0.5)):
        t0 = time.time()
        best = self.shortlist[0]
        k = {"k": self.spec.default_k}
        entries = [(f"raw:{best}", "raw", best, {}), (f"hybrid_qubo:{best}", "hybrid_qubo", best, k),
                   ("qsvm", "qsvm", "qsvm", {"family": "angle_cnot", "scale": 1.5, "C": 10.0})]
        md = missing_data_experiment(self.X, self.y, self.spec, entries, list(rates), self.budget["md_reps"],
                                     seed=self.seed, verbose=self.verbose)
        self._table(md, "07_missing_data.csv")
        self._save(plots.missing_curves(md, "accuracy", f"{self.task}: robustness to missing soil readings"),
                   "07_missing_data.png")
        g = md.groupby(["label", "imputer", "rate"]).accuracy.mean().unstack()
        self.results["missing_data_mean_accuracy"] = {f"{a}|{b}": v for (a, b), v in g.round(4).T.to_dict().items()}
        self._tick("missing_data", t0)
        return g

    def finalize(self, alpha=0.1):
        t0 = time.time()
        members = candidate_key(self.choice)
        desc = (f"AgriQNet v3 {self.task}: {self.choice['model']} [{self.choice['arm']}] — {ARMS.get(self.choice['arm'], 'soft-vote ensemble')}. "
                f"Selected because {self.choice_reason}.")
        rec, info = fit_final_recommender(members, self.X, self.y, self.spec, list(self.le.classes_),
                                          self.budget["trials"], self.budget["inner"], self.seed, alpha=alpha,
                                          description=desc)
        self.recommender, self.final_info = rec, info
        P0, P1 = info["oof_proba"], info["oof_proba_T"]
        self._save(plots.reliability(self.y, P0, P1, f"{self.task}: calibration (out-of-fold)"), "08_reliability.png")
        self._save(plots.confusion(self.y, P1.argmax(1), list(self.le.classes_),
                                   f"{self.task}: final model, out-of-fold confusion (row-normalised)"), "08_confusion.png")
        self.results["final_model"] = {k: v for k, v in info.items() if not k.startswith("oof_proba")}
        self.results["final_model"]["selected_features"] = rec.selected_features
        self._tick("finalize", t0)
        return info

    def report(self):
        """Markdown summary of this run's key numbers, generated from results.json (paste into the write-up)."""
        r, m = self.results, self.metric
        lines = [f"### {self.task} — run summary ({r['budget']} budget, seed {r['seed']})",
                 f"- Data: {r['n_rows']} rows, {r['n_classes']} classes; primary metric **{m}**.",
                 f"- Quantum bank: {r['bank']['n_configs']} fixed circuits on {r['bank']['n_qubits']} qubits → "
                 f"{r['bank']['n_quantum_features']} expectation features "
                 f"({r['bank']['n_nonconstant']} non-constant); simulator matches PennyLane to ≤1e-10."]
        if "summary_top" in r:
            lines.append("\n| candidate | " + m + " (mean ± corrected SE) | accuracy | log-loss |\n|---|---|---|---|")
            for row in r["summary_top"][:6]:
                lines.append(f"| {row['model']} · {row['arm']} | {row[m + '_mean']:.4f} ± {row[m + '_corrected_se']:.4f} "
                             f"| {row['accuracy_mean']:.4f} | {row['log_loss_mean']:.4f} |")
            sig = [v for v in r["vs_raw"] if v.get("verdict") != "no significant difference"]
            lines.append(f"- Versus raw features (Nadeau–Bengio corrected t-test, Holm): "
                         f"{len(sig)} of {len(r['vs_raw'])} comparisons significant"
                         + ("" if not sig else ": " + "; ".join(f"{v['model']}·{v['arm']} {v['verdict']} "
                                                              f"(Δ={v['mean_diff']:+.4f})" for v in sig)) + ".")
            lines.append(f"- Final model: **{r['final_choice']['model']} · {r['final_choice']['arm']}** — "
                         f"{r['final_choice']['reason']}.")
        if r.get("learning_curve_tests"):
            t = pd.DataFrame(r["learning_curve_tests"])
            t = t[t.label.str.startswith("hybrid_qubo") | (t.label == "qsvm")]
            for _, row in t.sort_values("size").head(6).iterrows():
                p = row["p_holm"]
                unit = " per class" if self.kind == "crop" else " samples"
                lines.append(f"- Low data ({row['size']}{unit}): {row['label']} − {row['vs']} = {row['mean_diff']:+.3f} accuracy"
                             + (f" (Holm p={p:.3f})" if pd.notna(p) else ""))
        if "final_model" in r:
            f = r["final_model"]
            lines.append(f"- Out-of-fold after temperature scaling (T={f['temperature']:.2f}): "
                         f"accuracy {f['oof_metrics_after_T']['accuracy']:.4f}, log-loss {f['oof_metrics_after_T']['log_loss']:.4f}, "
                         f"ECE {f['oof_metrics_before_T']['ece']:.3f}→{f['oof_metrics_after_T']['ece']:.3f}; "
                         f"90% conformal sets cover {f['oof_conformal_coverage']:.3f} with mean size {f['oof_mean_set_size']:.2f}.")
        if "qaoa_demo" in r:
            q = r["qaoa_demo"]
            lines.append(f"- QAOA demo: approximation ratio {q['approx_ratio']:.3f}, P(optimal)={q['p_optimal']:.3f}, "
                         f"matches exact solver: {q['match']}.")
        lines.append("- All circuits are classically simulated (≤8 qubits); no quantum computational advantage is claimed.")
        md = "\n".join(lines)
        with open(os.path.join(self.dir, "SUMMARY.md"), "w") as fh:
            fh.write(md)
        return md

    def save(self):
        out = os.path.join(self.dir, "model")
        manifest = {"task": self.task, "description": self.recommender.description,
                    "choice": self.results.get("final_choice"), "final": self.results.get("final_model"),
                    "data_sha256": self.results["data_sha256"], "budget": self.budget_name, "seed": self.seed}
        save_artifact(self.recommender, out, manifest, self.X.head(10))
        ok, diff = verify_reload(out)
        self.results["artifact"] = {"path": out, "reload_ok": ok, "max_abs_diff": diff}
        self.results["versions"] = versions()
        self.dump()
        assert ok, f"reload mismatch {diff}"
        return out, ok, diff
