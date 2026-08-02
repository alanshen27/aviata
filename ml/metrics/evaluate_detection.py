#!/usr/bin/env python3
"""
Deterministic empty-leg detection metrics.

- Hash-stable train/holdout split (no RNG)
- Fixed threshold grid
- Heuristic + trained XGB (+ builtin logistic) heads
- Listing-anchored recall on marketplace positives
- Writes a canonical JSON report for CI / /api/metrics
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
MODELS = ROOT / "models"
REPORTS = ROOT / "metrics" / "reports"

FEATURE_NAMES = [
    "distance_nm",
    "ground_time_hours",
    "origin_private_score",
    "dest_private_score",
    "fbo_pair_score",
    "is_asymmetric",
    "is_return_corridor",
    "short_turnaround",
    "idle_then_ferry",
    "one_way_ratio_7d",
    "legs_last_48h",
    "hour_of_day_utc",
    "dow",
    "aircraft_class_ord",
    "typical_seats",
    "same_country",
    "prior_leg_distance_nm",
    "heading_delta_deg",
]

THRESHOLDS = [0.35, 0.42, 0.50, 0.55, 0.65, 0.75]

# Builtin weights must stay aligned with src/lib/ml/ensemble.ts
XGB_WEIGHTS = np.array(
    [
        0.0008,
        -0.01,
        1.4,
        1.3,
        1.8,
        1.6,
        -2.2,
        1.1,
        0.9,
        1.2,
        0.15,
        0.01,
        0.02,
        0.08,
        0.01,
        0.2,
        0.0004,
        0.002,
    ],
    dtype=np.float64,
)
XGB_BIAS = -3.2


def sigmoid(z: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-z))


def score_heuristic(X: np.ndarray) -> np.ndarray:
    # Column indices match FEATURE_NAMES
    score = np.full(X.shape[0], 0.15, dtype=np.float64)
    score += 0.22 * X[:, 5]  # asymmetric
    score += 0.12 * X[:, 7]  # short turnaround
    score += 0.10 * X[:, 8]  # idle ferry
    score += np.where(X[:, 4] >= 0.9, 0.14, np.where(X[:, 4] >= 0.8, 0.08, 0.0))
    score += np.where(X[:, 9] >= 0.6, 0.12, 0.0)
    score -= 0.35 * X[:, 6]  # return corridor
    score -= np.where((X[:, 0] < 80) | (X[:, 0] > 3500), 0.15, 0.0)
    score -= np.where((X[:, 1] > 0) & (X[:, 1] < 1.5), 0.10, 0.0)
    return np.clip(score, 0.02, 0.98)


def score_builtin_xgb(X: np.ndarray) -> np.ndarray:
    z = XGB_BIAS + X @ XGB_WEIGHTS
    return sigmoid(z)


def score_lstm_builtin(X: np.ndarray) -> np.ndarray:
    cue = (
        X[:, 5] * 0.45
        + X[:, 9] * 0.35
        + np.where(X[:, 17] > 90, 0.15, 0.0)
        + X[:, 8] * 0.2
        + X[:, 7] * 0.15
        - X[:, 6] * 0.55
    )
    return sigmoid(cue * 2.4 - 0.4)


def score_ensemble(xgb: np.ndarray, lstm: np.ndarray, heur: np.ndarray) -> np.ndarray:
    return np.clip(0.45 * xgb + 0.35 * lstm + 0.2 * heur, 0.01, 0.99)


def row_key(row: pd.Series) -> str:
    raw = "|".join(
        [
            str(row.get("icao24", "")),
            str(row.get("departed_at", "")),
            str(row.get("origin_icao", row.get("origin_iata", ""))),
            str(row.get("dest_icao", row.get("destination_iata", ""))),
            f"{float(row['distance_nm']):.1f}",
            f"{float(row['ground_time_hours']):.2f}",
            f"{int(row['is_asymmetric'])}",
            f"{int(row['is_return_corridor'])}",
        ]
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def hash_holdout_mask(df: pd.DataFrame, holdout_pct: float = 0.2) -> np.ndarray:
    """Deterministic holdout: hash(key) % 1000 < holdout_pct*1000."""
    cutoff = int(holdout_pct * 1000)
    keys = df.apply(row_key, axis=1)
    return keys.map(lambda h: int(h[:8], 16) % 1000 < cutoff).to_numpy()


def binary_metrics(y_true: np.ndarray, y_score: np.ndarray, threshold: float) -> dict:
    y_pred = (y_score >= threshold).astype(np.int32)
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    specificity = tn / (tn + fp) if (tn + fp) else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall)
        else 0.0
    )
    acc = (tp + tn) / max(1, tp + tn + fp + fn)
    return {
        "threshold": threshold,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "specificity": round(specificity, 6),
        "f1": round(f1, 6),
        "accuracy": round(acc, 6),
    }


def roc_auc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    # Deterministic AUC via rank statistic (no sklearn RNG).
    pos = y_score[y_true == 1]
    neg = y_score[y_true == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    # Mann–Whitney
    order = np.argsort(y_score, kind="mergesort")
    ranks = np.empty_like(order, dtype=np.float64)
    ranks[order] = np.arange(1, len(y_score) + 1, dtype=np.float64)
    # average ties
    sorted_scores = y_score[order]
    i = 0
    while i < len(sorted_scores):
        j = i
        while j < len(sorted_scores) and sorted_scores[j] == sorted_scores[i]:
            j += 1
        if j - i > 1:
            avg = (i + 1 + j) / 2.0
            ranks[order[i:j]] = avg
        i = j
    sum_pos = ranks[y_true == 1].sum()
    auc = (sum_pos - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))
    return float(auc)


def best_f1(threshold_rows: list[dict]) -> dict:
    return max(threshold_rows, key=lambda r: (r["f1"], r["precision"], -r["threshold"]))


def evaluate_head(name: str, y: np.ndarray, scores: np.ndarray) -> dict:
    sweeps = [binary_metrics(y, scores, t) for t in THRESHOLDS]
    return {
        "head": name,
        "n": int(len(y)),
        "positive_rate": round(float(y.mean()), 6) if len(y) else 0.0,
        "auc": round(roc_auc(y, scores), 6),
        "score_mean": round(float(scores.mean()), 6),
        "score_std": round(float(scores.std()), 6),
        "thresholds": sweeps,
        "best_f1": best_f1(sweeps),
    }


def load_open_features(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = [c for c in FEATURE_NAMES + ["label"] if c not in df.columns]
    if missing:
        raise SystemExit(f"missing columns: {missing}")
    return df


def fixture_builtin_scores() -> dict:
    """Canonical cases — must remain stable across refactors."""
    cases = {
        "asymmetric_fbo_ferry": {
            "distance_nm": 950,
            "ground_time_hours": 3.5,
            "origin_private_score": 0.98,
            "dest_private_score": 0.93,
            "fbo_pair_score": 0.955,
            "is_asymmetric": 1,
            "is_return_corridor": 0,
            "short_turnaround": 1,
            "idle_then_ferry": 0,
            "one_way_ratio_7d": 0.71,
            "legs_last_48h": 2,
            "hour_of_day_utc": 15,
            "dow": 2,
            "aircraft_class_ord": 2,
            "typical_seats": 9,
            "same_country": 1,
            "prior_leg_distance_nm": 1500,
            "heading_delta_deg": 125,
        },
        "exact_return_corridor": {
            "distance_nm": 950,
            "ground_time_hours": 3.5,
            "origin_private_score": 0.98,
            "dest_private_score": 0.93,
            "fbo_pair_score": 0.955,
            "is_asymmetric": 0,
            "is_return_corridor": 1,
            "short_turnaround": 1,
            "idle_then_ferry": 0,
            "one_way_ratio_7d": 0.30,
            "legs_last_48h": 2,
            "hour_of_day_utc": 15,
            "dow": 2,
            "aircraft_class_ord": 2,
            "typical_seats": 9,
            "same_country": 1,
            "prior_leg_distance_nm": 950,
            "heading_delta_deg": 180,
        },
    }
    out = {}
    for name, feats in cases.items():
        x = np.array([[feats[k] for k in FEATURE_NAMES]], dtype=np.float64)
        heur = float(score_heuristic(x)[0])
        xgb = float(score_builtin_xgb(x)[0])
        lstm = float(score_lstm_builtin(x)[0])
        ens = float(score_ensemble(np.array([xgb]), np.array([lstm]), np.array([heur]))[0])
        out[name] = {
            "heuristic": round(heur, 6),
            "builtin_xgb": round(xgb, 6),
            "builtin_lstm": round(lstm, 6),
            "ensemble": round(ens, 6),
        }
    # Ordering invariant used in CI
    out["ordering"] = {
        "ferry_beats_return_ensemble": out["asymmetric_fbo_ferry"]["ensemble"]
        > out["exact_return_corridor"]["ensemble"]
    }
    return out


def evaluate_listings(listings_csv: Path, scores_fn) -> dict | None:
    if not listings_csv.exists():
        return None
    df = pd.read_csv(listings_csv)
    if df.empty:
        return None
    X = df[FEATURE_NAMES].to_numpy(dtype=np.float64)
    scores = scores_fn(X)
    # All listing rows are positives — report recall@threshold + mean score
    y = np.ones(len(df), dtype=np.int32)
    sweeps = [binary_metrics(y, scores, t) for t in THRESHOLDS]
    return {
        "n_listings": int(len(df)),
        "mean_score": round(float(scores.mean()), 6),
        "median_score": round(float(np.median(scores)), 6),
        "recall_by_threshold": {str(t["threshold"]): t["recall"] for t in sweeps},
        "note": "Listing rows are marketplace positives with synthetic mid-range distance priors",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--features",
        type=Path,
        default=PROCESSED / "emptyleg_open_features.csv",
    )
    parser.add_argument(
        "--listings-features",
        type=Path,
        default=PROCESSED / "listed_empty_leg_features.csv",
    )
    parser.add_argument("--holdout", type=float, default=0.2)
    args = parser.parse_args()

    REPORTS.mkdir(parents=True, exist_ok=True)

    if not args.features.exists():
        print(f"Missing features: {args.features}. Run data:ingest first.", file=sys.stderr)
        return 1

    df = load_open_features(args.features)
    holdout = hash_holdout_mask(df, args.holdout)
    train_df = df.loc[~holdout]
    test_df = df.loc[holdout]

    X_test = test_df[FEATURE_NAMES].to_numpy(dtype=np.float64)
    y_test = test_df["label"].to_numpy(dtype=np.int32)

    heur = score_heuristic(X_test)
    builtin_xgb = score_builtin_xgb(X_test)
    builtin_lstm = score_lstm_builtin(X_test)
    builtin_ens = score_ensemble(builtin_xgb, builtin_lstm, heur)

    heads = [
        evaluate_head("heuristic", y_test, heur),
        evaluate_head("builtin_xgb", y_test, builtin_xgb),
        evaluate_head("builtin_lstm", y_test, builtin_lstm),
        evaluate_head("builtin_ensemble", y_test, builtin_ens),
    ]

    xgb_path = MODELS / "xgb_emptyleg.joblib"
    trained = None
    if xgb_path.exists():
        model = joblib.load(xgb_path)
        trained_scores = model.predict_proba(X_test)[:, 1]
        trained = evaluate_head("trained_xgb", y_test, trained_scores)
        heads.append(trained)
        # Ensemble with trained xgb replacing builtin xgb
        trained_ens = score_ensemble(trained_scores, builtin_lstm, heur)
        heads.append(evaluate_head("trained_ensemble", y_test, trained_ens))

    listing_eval = evaluate_listings(
        args.listings_features,
        lambda X: score_ensemble(
            score_builtin_xgb(X), score_lstm_builtin(X), score_heuristic(X)
        ),
    )

    fixtures = fixture_builtin_scores()

    # Production guidance (honest ranges — not the leaked weak-label AUC)
    prod_guidance = {
        "weak_label_holdout_note": (
            "Open-data labels are derived from the same geometry features the "
            "model sees, so holdout AUC/F1 here are optimistic upper bounds."
        ),
        "expected_prod_precision_at_0_55": "0.55–0.75",
        "expected_prod_recall_at_0_55": "0.35–0.60",
        "expected_listing_recall_at_0_50": "0.70–0.95",
        "needs_for_real_accuracy": [
            "Operator FMS empty legs (FL3XX/Leon) or Avinode listings as labels",
            "Time-based split with ADS-B features joined to listing OD+day",
            "Human review set of 200–500 legs",
        ],
    }

    report = {
        "schema_version": 1,
        "deterministic": True,
        "split": {
            "method": "sha256(row_key) % 1000 < holdout*1000",
            "holdout_pct": args.holdout,
            "train_rows": int(len(train_df)),
            "holdout_rows": int(len(test_df)),
            "holdout_positive_rate": round(float(y_test.mean()), 6),
        },
        "label_source": "weak_geometry",
        "fixtures": fixtures,
        "heads": {h["head"]: h for h in heads},
        "listing_anchored": listing_eval,
        "production_guidance": prod_guidance,
        "listing_sources_doc": "ml/data/LISTINGS.md",
    }

    # Canonical serialization (sorted keys) for golden diffs
    out_path = REPORTS / "detection_metrics.json"
    out_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")

    # Compact summary printed for CLIs / BullMQ
    summary = {
        "holdout_rows": report["split"]["holdout_rows"],
        "heuristic_auc": report["heads"]["heuristic"]["auc"],
        "builtin_ensemble_auc": report["heads"]["builtin_ensemble"]["auc"],
        "builtin_ensemble_best_f1": report["heads"]["builtin_ensemble"]["best_f1"],
        "trained_xgb_auc": report["heads"].get("trained_xgb", {}).get("auc"),
        "listing_mean_score": (listing_eval or {}).get("mean_score"),
        "listing_recall_at_0_5": (listing_eval or {}).get("recall_by_threshold", {}).get(
            "0.5"
        ),
        "fixture_ferry_beats_return": fixtures["ordering"]["ferry_beats_return_ensemble"],
        "report": str(out_path),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
