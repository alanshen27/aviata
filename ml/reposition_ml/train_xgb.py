from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from .features import FEATURE_NAMES
from .synthetic import generate_tabular

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"


def train(seed: int = 7) -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    df = generate_tabular(n=5000, seed=seed)
    X = df[FEATURE_NAMES].to_numpy()
    y = df["label"].to_numpy()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    model = XGBClassifier(
        n_estimators=120,
        max_depth=4,
        learning_rate=0.08,
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
        "feature_names": FEATURE_NAMES,
        "auc": auc,
        "positive_rate": float(y.mean()),
        "report": report,
    }
    (MODEL_DIR / "xgb_metrics.json").write_text(json.dumps(meta, indent=2))

    # Export a tiny coefficient snapshot for the TS builtin fallback sanity check.
    importance = {
        name: float(v)
        for name, v in zip(FEATURE_NAMES, model.feature_importances_)
    }
    (MODEL_DIR / "xgb_importance.json").write_text(
        json.dumps(importance, indent=2)
    )
    return meta


if __name__ == "__main__":
    metrics = train()
    print(json.dumps({"auc": metrics["auc"], "ok": True}, indent=2))
