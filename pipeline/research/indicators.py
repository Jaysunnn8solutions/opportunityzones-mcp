"""Offline, reproducible research models. No network, credentials, or user data.

Run: python pipeline/research/indicators.py
Requires numpy, pandas and scikit-learn (BSD licensed, no paid services).
The available data support a retrospective geographic validation, NOT a 2037
selection forecast or a validated annual lead/lag estimate.
"""
import hashlib
import json
import os
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np
import pandas as pd
import sklearn
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
SEED = 2027
# Explicit allowlist: no 2024 fields, designation labels, eligibility inputs from
# the future, protected-class composition, IDs, or geographic identifiers.
FEATURES = {
    "log_density_2016": "Population density · 2012–2016",
    "vacancy_rate_2016": "Housing vacancy · 2012–2016",
    "owner_share_2016": "Owner-occupied housing · 2012–2016",
    "median_year_built_2016": "Median year housing was built · 2012–2016",
    "pre_dlog_pop": "Earlier population change · 2006–2010 to 2012–2016",
    "pre_d_vacancy": "Earlier vacancy change · 2006–2010 to 2012–2016",
    "pre_dlog_hh_income": "Earlier real household-income change · 2006–2010 to 2012–2016",
    "pre_dlog_rent": "Earlier real rent change · 2006–2010 to 2012–2016",
}
TARGETS = {
    "out_dlog_pop": "Population change",
    "out_dlog_housing_units": "Housing-unit change",
    "out_dlog_hh_income": "Inflation-adjusted household-income change",
}


def numeric(frame, columns):
    return frame[list(columns)].apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)


def stable_mapping(pairs):
    """Require >=99% overlap in BOTH directions for population AND housing.

    Do not silently assign one old tract's history to a split/merged tract.
    """
    p = pairs.copy()
    valid = np.ones(len(p), dtype=bool)
    for weight in ("pop20", "hu20"):
        p[weight] = pd.to_numeric(p[weight], errors="coerce").fillna(0)
        old_total = p.groupby("geoid10")[weight].transform("sum")
        new_total = p.groupby("geoid20")[weight].transform("sum")
        valid &= (old_total > 0) & (new_total > 0)
        valid &= (p[weight] / old_total >= .99) & (p[weight] / new_total >= .99)
    return dict(zip(p.loc[valid, "geoid10"], p.loc[valid, "geoid20"]))


def fit_outcome(frame, target):
    rows = frame.loc[pd.to_numeric(frame[target], errors="coerce").notna()].copy()
    x = numeric(rows, FEATURES).to_numpy()
    y = pd.to_numeric(rows[target]).to_numpy(dtype=float)
    finite = np.isfinite(y)
    x, y, rows = x[finite], y[finite], rows.loc[finite]
    groups = rows.geoid10.str[:2].to_numpy()
    if len(y) < 500 or len(set(groups)) < 5:
        return {"outcome": TARGETS[target], "status": "insufficient-data", "rows": len(y), "indicators": []}
    predictions = {k: np.zeros(len(y)) for k in ("ridge", "boosting", "median", "no-change")}
    importances = {k: [] for k in ("ridge", "boosting")}
    fold_errors = {k: [] for k in predictions}
    folds = []
    for fold, (train, test) in enumerate(GroupKFold(5).split(x, y, groups)):
        assert not set(groups[train]) & set(groups[test])
        models = {
            "ridge": make_pipeline(SimpleImputer(strategy="median", keep_empty_features=True), StandardScaler(), Ridge(alpha=100)),
            "boosting": HistGradientBoostingRegressor(max_iter=70, max_leaf_nodes=7, min_samples_leaf=50, l2_regularization=10, early_stopping=False, random_state=SEED),
            "median": DummyRegressor(strategy="median"),
            "no-change": DummyRegressor(strategy="constant", constant=0),
        }
        for name, model in models.items():
            model.fit(x[train], y[train])
            predictions[name][test] = model.predict(x[test])
            fold_errors[name].append(float(mean_absolute_error(y[test], predictions[name][test])))
            if name in importances:
                sample = np.random.default_rng(SEED + fold).choice(test, min(1200, len(test)), replace=False)
                importance = permutation_importance(model, x[sample], y[sample], scoring="neg_mean_absolute_error", n_repeats=3, random_state=SEED + fold, n_jobs=1)
                importances[name].append(importance.importances_mean)
        folds.append({"testStates": sorted(set(groups[test])), "trainRows": len(train), "testRows": len(test)})
    errors = {name: float(mean_absolute_error(y, p)) for name, p in predictions.items()}
    winner = min(("ridge", "boosting"), key=lambda k: errors[k])
    baseline = min(("median", "no-change"), key=lambda k: errors[k])
    skill = 1 - errors[winner] / errors[baseline] if errors[baseline] > 0 else None
    imp = np.array(importances[winner])
    indicators = []
    for i, (key, label) in enumerate(FEATURES.items()):
        indicators.append({"key": key, "label": label,
            "importance": float(np.mean(imp[:, i])), "positiveFolds": int(np.sum(imp[:, i] > 0)),
            "timing": "insufficient-evidence",
            "timingReason": "Earlier-period predictor tested across states in one historical interval. Repeated time validation and annual timing are unavailable."})
    indicators.sort(key=lambda row: row["importance"], reverse=True)
    return {"outcome": TARGETS[target], "status": "exploratory", "rows": len(y), "states": len(set(groups)),
        "selectedModel": winner, "baseline": baseline, "skill": skill, "errors": errors,
        "errorUnit": "absolute log change over the full 2012–2016 to 2020–2024 comparison",
        "foldErrors": fold_errors, "folds": folds, "indicators": indicators,
        "temporalValidation": False, "releaseVintageValidation": False,
        "selectionProbability": None}


def finite_number(value):
    return float(value) if pd.notna(value) and np.isfinite(float(value)) else None


def main():
    analysis_path = ROOT / "data/oz1/analysis.csv"
    mapping_path = ROOT / "pipeline/clean/xwalk_t10_t20.csv"
    frame = pd.read_csv(analysis_path, dtype={"geoid10": str})
    pairs = pd.read_csv(mapping_path, dtype={"geoid10": str, "geoid20": str}, usecols=["geoid10", "geoid20", "pop20", "hu20"])
    mapping = stable_mapping(pairs)
    # Minimum baseline size avoids zero-denominator changes and very small tracts.
    selected = frame.loc[frame.geoid10.isin(mapping) & (frame.pop_2016 >= 100) & (frame.hu_2016 >= 50)].copy()
    models = []
    for target in TARGETS:
        print(f"Training {TARGETS[target]} on stable tract histories...", flush=True)
        models.append(fit_outcome(selected, target))
    histories = {}
    for row in selected.to_dict("records"):
        changes = {}
        for key in TARGETS:
            value = finite_number(row.get(key))
            changes[key] = round(float(np.expm1(value)), 6) if value is not None else None
        histories[mapping[row["geoid10"]]] = {"geoid2010": row["geoid10"], "changes": changes}
    manifest = json.loads((ROOT / "data/manifest.json").read_text(encoding="utf-8"))
    paths = [analysis_path, mapping_path, ROOT / "data/tracts.bin", ROOT / "data/manifest.json"]
    fingerprints = {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    result = {"schemaVersion": 1, "datasetVersion": manifest["generated"], "seed": SEED,
        "libraries": {"sklearn": sklearn.__version__, "numpy": np.__version__, "pandas": pd.__version__},
        "fingerprints": fingerprints, "models": models, "histories": histories,
        "sourceIds": ["acs5", "decennialPl", "blsCpi"],
        "limitations": [
            "Five geographic folds hold out entire states; all folds share one historical outcome interval.",
            "Model selection and evaluation use the same folds. Reported performance is exploratory, not an independent final test.",
            "ACS five-year estimates describe periods, not single-year observations. One-year lead/lag timing cannot be inferred.",
            "The crosswalk uses 2020 population/housing and current source revisions. This is retrospective research, not an as-published historical forecast.",
            "Only tracts with at least 99% population and housing overlap in both directions are included. Boundary changes and small baselines reduce coverage.",
            "Survey uncertainty and spatial dependence across state borders remain; these results do not establish causation or program impact.",
            "No model of government nomination or certification has been trained. No 2037 eligibility or selection probability is supported.",
        ]}
    output = ROOT / "data/research-indicators.json"
    output.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(json.dumps({"artifact": str(output), "histories": len(histories), "models": [{k: m.get(k) for k in ("outcome", "rows", "selectedModel", "skill")} for m in models]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
