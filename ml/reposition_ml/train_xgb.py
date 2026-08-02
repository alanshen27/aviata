from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from .features import FEATURE_NAMES
from .synthetic import generate_tabular

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"
OPEN_FEATURES = ROOT / "data" / "processed" / "emptyleg_open_features.csv"


def _load_frame(from_open_data: bool, mix_synthetic: float, seed: int) -> tuple[pd.DataFrame, str]:
    if from_open_data and OPEN_FEATURES.exists():
        open_df = pd.read_csv(OPEN_FEATURES)
        missing = [c for c in FEATURE_NAMES + ["label"] if c not in open_df.columns]
        if missing:
            raise SystemExit(f"Open features missing columns: {missing}")
        source = "open_weak_labels"
        if mix_synthetic > 0:
            n_syn = max(1, int(len(open_df) * mix_synthetic))
            syn = generate_tabular(n=n_syn, seed=seed)
            open_df = pd.concat(
                [open_df[FEATURE_NAMES + ["label"]], syn[FEATURE_NAMES + ["label"]]],
                ignore_index=True,
            )
            source = f"open_weak_labels+synthetic({mix_synthetic})"
        return open_df, source

    return generate_tabular(n=5000, seed=seed), "synthetic"


def train(
    seed: int = 7,
    from_open_data: bool = False,
    mix_synthetic: float = 0.25,
) -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    df, source = _load_frame(from_open_data, mix_synthetic, seed)
    X = df[FEATURE_NAMES].to_numpy()
    y = df["label"].to_numpy()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    model = XGBClassifier(
        n_estimators=160,
        max_depth=5,
        learning_rate=0.07,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="auc",
        random_state=seed,
        n_jobs=2,
    )
    model.fit(X_train, y_train)

    proba = model.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    auc = float(roc_auc_score(y_test, proba))
    report = classification_report(y_test, pred, output_dict=True)

    joblib.dump(model, MODEL_DIR / "xgb_emptyleg.joblib")
    meta = {
        "model": "xgboost",
        "data_source": source,
        "rows": int(len(df)),
        "feature_names": FEATURE_NAMES,
        "auc": auc,
        "positive_rate": float(y.mean()),
        "report": report,
    }
    (MODEL_DIR / "xgb_metrics.json").write_text(json.dumps(meta, indent=2))

    importance = {
        name: float(v)
        for name, v in zip(FEATURE_NAMES, model.feature_importances_)
    }
    (MODEL_DIR / "xgb_importance.json").write_text(json.dumps(importance, indent=2))
    return meta


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-open-data", action="store_true")
    parser.add_argument("--mix-synthetic", type=float, default=0.25)
    args = parser.parse_args()
    metrics = train(
        from_open_data=args.from_open_data,
        mix_synthetic=args.mix_synthetic,
    )
    print(json.dumps({"auc": metrics["auc"], "data_source": metrics["data_source"], "ok": True}, indent=2))
