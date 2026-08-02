from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import torch

from .features import FEATURE_DIM, FEATURE_NAMES, SEQ_LEN
from .train_lstm import EmptyLegLSTM

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def heuristic_score(features: np.ndarray) -> float:
    f = {name: float(features[i]) for i, name in enumerate(FEATURE_NAMES)}
    score = 0.15
    if f["is_asymmetric"]:
        score += 0.22
    if f["short_turnaround"]:
        score += 0.12
    if f["idle_then_ferry"]:
        score += 0.1
    if f["fbo_pair_score"] >= 0.9:
        score += 0.14
    elif f["fbo_pair_score"] >= 0.8:
        score += 0.08
    if f["one_way_ratio_7d"] >= 0.6:
        score += 0.12
    if f["is_return_corridor"]:
        score -= 0.35
    if f["distance_nm"] < 80 or f["distance_nm"] > 3500:
        score -= 0.15
    return float(min(0.98, max(0.02, score)))


def load_xgb():
    path = MODEL_DIR / "xgb_emptyleg.joblib"
    if not path.exists():
        return None
    return joblib.load(path)


def load_lstm() -> EmptyLegLSTM | None:
    path = MODEL_DIR / "lstm_emptyleg.pt"
    if not path.exists():
        return None
    payload = torch.load(path, map_location="cpu", weights_only=False)
    model = EmptyLegLSTM(
        input_dim=payload.get("input_dim", FEATURE_DIM),
        hidden=payload.get("hidden", 32),
    )
    model.load_state_dict(payload["state_dict"])
    model.eval()
    return model


def score(
    features: list[float],
    sequence: list[list[float]] | None = None,
) -> dict[str, Any]:
    x = np.asarray(features, dtype=np.float64)
    if x.shape[0] != len(FEATURE_NAMES):
        raise ValueError(
            f"Expected {len(FEATURE_NAMES)} features, got {x.shape[0]}"
        )

    heur = heuristic_score(x)

    xgb_model = load_xgb()
    if xgb_model is not None:
        xgb = float(xgb_model.predict_proba(x.reshape(1, -1))[0, 1])
    else:
        # logistic stand-in aligned with TS builtin
        weights = np.array(
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
            ]
        )
        xgb = _sigmoid(float(np.dot(weights, x) - 3.2))

    lstm_model = load_lstm()
    if lstm_model is not None:
        if sequence is None:
            seq = np.tile(x.astype(np.float32), (SEQ_LEN, 1))
        else:
            seq = np.asarray(sequence, dtype=np.float32)
            if seq.ndim != 2:
                raise ValueError("sequence must be 2D")
            if seq.shape[1] != FEATURE_DIM:
                raise ValueError("sequence feature dim mismatch")
            if seq.shape[0] < SEQ_LEN:
                pad = np.tile(seq[:1], (SEQ_LEN - seq.shape[0], 1))
                seq = np.vstack([pad, seq])
            seq = seq[-SEQ_LEN:]
        with torch.no_grad():
            logit = lstm_model(torch.from_numpy(seq).unsqueeze(0))
            lstm = float(torch.sigmoid(logit).item())
    else:
        sequence_cue = (
            x[5] * 0.45
            + x[9] * 0.35
            + (0.15 if x[17] > 90 else 0.0)
            + x[8] * 0.2
            + x[7] * 0.15
            - x[6] * 0.55
        )
        lstm = _sigmoid(sequence_cue * 2.4 - 0.4)

    ensemble = float(
        min(0.99, max(0.01, 0.45 * xgb + 0.35 * lstm + 0.2 * heur))
    )
    return {
        "xgb": xgb,
        "lstm": lstm,
        "heuristic": heur,
        "ensemble": ensemble,
        "models_loaded": {
            "xgb": xgb_model is not None,
            "lstm": lstm_model is not None,
        },
    }
