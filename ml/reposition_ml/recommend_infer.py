from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch

from .train_transformer import (
    AIRPORT_TO_IDX,
    SEQ_LEN,
    TripTransformer,
)

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models"


def _code(name: str) -> int:
    return AIRPORT_TO_IDX.get(name.upper(), AIRPORT_TO_IDX["UNK"])


def load_transformer() -> tuple[TripTransformer, dict] | None:
    path = MODEL_DIR / "transformer_return.pt"
    if not path.exists():
        return None
    payload = torch.load(path, map_location="cpu", weights_only=False)
    model = TripTransformer()
    model.load_state_dict(payload["state_dict"])
    model.eval()
    return model, payload


def builtin_return_prob(days_away: float, predicted_stay: float, at_home: bool) -> float:
    if at_home or days_away <= 0:
        return 0.08
    delta = days_away - predicted_stay
    z = 1.6 - abs(delta) * 0.55 + min(days_away, 14) * 0.08
    if delta < -3:
        z -= 0.8
    if delta > 0:
        z += min(1.2, delta * 0.35)
    return float(1 / (1 + np.exp(-z)))


def score_return(payload: dict[str, Any]) -> dict[str, Any]:
    home = str(payload.get("home", "SIN")).upper()
    current = str(payload.get("current", home)).upper()
    days_away = float(payload.get("days_away", 0))
    predicted_stay = float(payload.get("predicted_stay_days", 7))
    trips = payload.get("trips") or []

    loaded = load_transformer()
    if loaded is None:
        p = builtin_return_prob(days_away, predicted_stay, current == home)
        return {
            "return_probability": p,
            "backend": "builtin",
            "models_loaded": {"transformer": False},
        }

    model, _meta = loaded
    origins = np.zeros((1, SEQ_LEN), dtype=np.int64)
    dests = np.zeros((1, SEQ_LEN), dtype=np.int64)
    nums = np.zeros((1, SEQ_LEN, 3), dtype=np.float32)
    pad = np.ones((1, SEQ_LEN), dtype=bool)

    # Historical trips + synthetic current token
    tokens: list[tuple[str, str, float, float, float]] = []
    for t in trips[-SEQ_LEN:]:
        o = str(t.get("origin", "UNK")).upper()
        d = str(t.get("destination", "UNK")).upper()
        stay = float(t["stay_days"]) if t.get("stay_days") is not None else 0.0
        homebound = 1.0 if d == home else 0.0
        tokens.append((o, d, stay, 0.0, homebound))

    tokens.append((home if current != home else current, current, predicted_stay, days_away, 0.0))
    tokens = tokens[-SEQ_LEN:]

    for i, (o, d, stay, away, homebound) in enumerate(tokens):
        origins[0, i] = _code(o)
        dests[0, i] = _code(d)
        nums[0, i] = [stay / 14.0, away / 14.0, homebound]
        pad[0, i] = False

    with torch.no_grad():
        logit = model(
            torch.from_numpy(origins),
            torch.from_numpy(dests),
            torch.from_numpy(nums),
            key_padding_mask=torch.from_numpy(pad),
        )
        p_model = float(torch.sigmoid(logit).item())

    # Blend with stay-window prior so day ~N recommendations aren't brittle.
    p_prior = builtin_return_prob(days_away, predicted_stay, current == home)
    p = 0.7 * p_model + 0.3 * p_prior

    return {
        "return_probability": p,
        "backend": "transformer",
        "models_loaded": {"transformer": True},
        "raw_transformer": p_model,
        "prior": p_prior,
    }
