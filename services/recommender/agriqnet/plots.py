"""Publication-style figures. Colours follow the entity (arm), never its rank."""
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import confusion_matrix

INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"
ARM_COLORS = {
    "raw": "#52514e", "hybrid_qubo": "#2a78d6", "qsvm": "#eb6834", "ctrl_rff": "#1baf7a",
    "ctrl_mrmr": "#eda100", "ablation_separable": "#e87ba4", "ctrl_mi": "#008300",
    "ctrl_random": "#6250d6", "hybrid_all": "#e34948",
}
CYCLE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]


def style():
    plt.rcParams.update({
        "font.size": 10.5, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6,
        "axes.spines.top": False, "axes.spines.right": False, "axes.edgecolor": INK2,
        "axes.labelcolor": INK, "xtick.color": INK2, "ytick.color": INK2, "lines.linewidth": 2,
        "figure.dpi": 120, "savefig.dpi": 300, "savefig.bbox": "tight", "legend.frameon": False,
    })


def color_for(label):
    for arm, c in ARM_COLORS.items():
        if label == arm or label.startswith(arm + ":") or label.endswith(":" + arm) or f"[{arm}]" in label:
            return c
    return CYCLE[abs(hash(label)) % len(CYCLE)]


def exploration_heatmaps(df, path=None):
    cols = [("geometric_difference_g", "Geometric difference g(K_C‖K_Q)", "Blues"),
            ("mean_1rdm_purity", "Mean single-qubit purity (1 = no entanglement)", "Greys"),
            ("kta_quantum", "Kernel–target alignment (descriptive)", "Greens")]
    fig, axes = plt.subplots(1, 3, figsize=(15, 3.8), sharey=True)
    fig.subplots_adjust(wspace=0.06)
    for i, (ax, (c, title, cmap)) in enumerate(zip(axes, cols)):
        piv = df.pivot_table(index="family", columns="scale", values=c, aggfunc="mean")
        sns.heatmap(piv, annot=True, fmt=".2f", cmap=cmap, ax=ax, cbar=False, linewidths=2, linecolor="white")
        ax.set_title(title, fontsize=10.5, color=INK)
        ax.set_xlabel("bandwidth scale s")
        ax.set_ylabel("")
        ax.grid(False)
        if i:
            ax.tick_params(axis="y", left=False, labelleft=False)
    fig.suptitle("Quantum feature exploration — circuit family × bandwidth", x=0.01, ha="left", color=INK)
    if path:
        fig.savefig(path)
    return fig


def candidate_strip(results, metric, title, path=None, higher_is_better=True):
    d = results.copy()
    d["candidate"] = d["model"] + " · " + d["arm"]
    order = d.groupby("candidate")[metric].mean().sort_values(ascending=not higher_is_better).index
    fig, ax = plt.subplots(figsize=(8, 0.38 * len(order) + 1.2))
    for i, cand in enumerate(order):
        v = d.loc[d.candidate == cand, metric].values
        arm = cand.split(" · ")[1]
        c = ARM_COLORS.get(arm, INK2)
        ax.scatter(v, np.full(len(v), i) + np.random.default_rng(i).uniform(-0.12, 0.12, len(v)), s=14,
                   color=c, alpha=0.45, linewidths=0)
        ax.errorbar(v.mean(), i, xerr=v.std(ddof=1) if len(v) > 1 else 0, fmt="o", ms=7, color=c,
                    mec="white", mew=1.5, capsize=0, lw=2)
    ax.set_yticks(range(len(order)))
    ax.set_yticklabels(order)
    ax.invert_yaxis()
    ax.set_xlabel(f"{metric} per outer split (dot = mean, bar = ±1 SD)")
    ax.set_title(title, loc="left", color=INK)
    if path:
        fig.savefig(path)
    return fig


def forest(compare, title, path=None):
    d = compare.copy()
    d["row"] = d["model"] + " · " + d["arm"]
    d = d.sort_values("mean_diff")
    fig, ax = plt.subplots(figsize=(8, 0.38 * len(d) + 1.2))
    for i, (_, r) in enumerate(d.iterrows()):
        c = ARM_COLORS.get(r["arm"], INK2)
        ax.plot([r["ci_low"], r["ci_high"]], [i, i], color=c, lw=2)
        ax.plot(r["mean_diff"], i, "o", color=c, ms=7, mec="white", mew=1.5)
        tag = "" if r["verdict"] == "no significant difference" else f"  {r['verdict']}"
        ax.text(r["ci_high"], i, f"  p_holm={r['p_holm']:.2f}{tag}", va="center", fontsize=8.5, color=INK2)
    ax.axvline(0, color=INK2, lw=1)
    ax.set_yticks(range(len(d)))
    ax.set_yticklabels(d["row"])
    ax.set_xlabel("difference vs raw features of the same model (corrected 95% CI)")
    ax.set_title(title, loc="left", color=INK)
    if path:
        fig.savefig(path)
    return fig


def learning_curves(lc, value="accuracy", title="", path=None, xlabel="training samples"):
    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    g = lc.groupby(["label", "n_train"])[value].agg(["mean", "std"]).reset_index()
    fams = sorted({lab.split(":")[1] for lab in g.label.unique() if ":" in lab})
    dash = {f: ls for f, ls in zip(fams, ["-", "--", ":", "-."])}
    for lab, h in g.groupby("label"):
        c = color_for(lab)
        ls = dash.get(lab.split(":")[1], "-") if ":" in lab else "-"
        ax.plot(h["n_train"], h["mean"], marker="o", ls=ls, color=c, ms=6, label=lab)
        ax.fill_between(h["n_train"], h["mean"] - h["std"], h["mean"] + h["std"], color=c, alpha=0.12, lw=0)
    ax.set_xscale("log")
    ticks = sorted(g["n_train"].unique())
    ax.set_xticks(ticks)
    ax.set_xticklabels([str(int(t)) for t in ticks])
    ax.minorticks_off()
    ax.set_xlabel(f"{xlabel} (log scale)")
    ax.set_ylabel(f"test {value}")
    ax.set_title(title, loc="left", color=INK)
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=9)
    if path:
        fig.savefig(path)
    return fig


def missing_curves(md, value="accuracy", title="", path=None):
    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    g = md.groupby(["label", "imputer", "rate"])[value].mean().reset_index()
    for (lab, imp), h in g.groupby(["label", "imputer"]):
        ax.plot(h["rate"] * 100, h[value], "-o" if imp == "iterative" else "--s", color=color_for(lab), ms=6,
                label=f"{lab} · {imp} imputation", alpha=1 if imp == "iterative" else 0.7)
    ax.set_xlabel("missing soil readings at test time (%)")
    ax.set_ylabel(f"test {value}")
    ax.set_title(title, loc="left", color=INK)
    ax.legend(fontsize=8.5, loc="upper left", bbox_to_anchor=(1.01, 1))
    if path:
        fig.savefig(path)
    return fig


def selection_frequency(freq, title, path=None, top=20):
    f = freq.head(top)[::-1]
    fig, ax = plt.subplots(figsize=(8, 0.32 * len(f) + 1.2))
    ax.barh(f.index, f.values, color="#2a78d6", height=0.6)
    ax.set_xlabel("fraction of outer folds in which the QUBO selected the feature")
    ax.set_xlim(0, 1)
    ax.set_title(title, loc="left", color=INK)
    if path:
        fig.savefig(path)
    return fig


def confusion(y, pred, labels, title, path=None):
    cm = confusion_matrix(y, pred, labels=np.arange(len(labels)), normalize="true")
    s = max(5, 0.42 * len(labels) + 2)
    fig, ax = plt.subplots(figsize=(s + 1, s))
    sns.heatmap(cm, cmap="Blues", vmin=0, vmax=1, square=True, xticklabels=labels, yticklabels=labels,
                annot=len(labels) <= 10, fmt=".2f", cbar_kws={"shrink": 0.7}, ax=ax)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title, loc="left", color=INK)
    if path:
        fig.savefig(path)
    return fig


def reliability(y, P_before, P_after, title, path=None, bins=10):
    fig, ax = plt.subplots(figsize=(5.2, 5))
    for P, lab, c in ((P_before, "before temperature scaling", "#52514e"), (P_after, "after", "#2a78d6")):
        conf, corr = P.max(1), (P.argmax(1) == y)
        edges = np.linspace(0, 1, bins + 1)
        xs, ys = [], []
        for lo, hi in zip(edges[:-1], edges[1:]):
            m = (conf > lo) & (conf <= hi)
            if m.sum() >= 3:
                xs.append(conf[m].mean())
                ys.append(corr[m].mean())
        ax.plot(xs, ys, "-o", color=c, ms=6, label=lab)
    ax.plot([0, 1], [0, 1], color=GRID, lw=1.5, zorder=0)
    ax.set_xlabel("predicted confidence")
    ax.set_ylabel("observed accuracy")
    ax.set_title(title, loc="left", color=INK)
    ax.legend(fontsize=9)
    if path:
        fig.savefig(path)
    return fig


def qaoa_history(hist, e_exact, title, path=None):
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    ax.plot(hist, color="#eb6834", label="QAOA ⟨H_cost⟩")
    ax.axhline(e_exact, color="#52514e", ls="--", lw=1.5, label="exact QUBO optimum")
    ax.set_xlabel("optimizer step")
    ax.set_ylabel("energy")
    ax.set_title(title, loc="left", color=INK)
    ax.legend(fontsize=9)
    if path:
        fig.savefig(path)
    return fig
