from __future__ import annotations

import numpy as np
import pandas as pd

from .features import FEATURE_NAMES, FEATURE_DIM, SEQ_LEN


def _label_from_row(row: np.ndarray, rng: np.random.Generator) -> int:
    """Soft rule prior used to mint training labels (stand-in for operator truth)."""
    (
        distance_nm,
        ground_time_hours,
        origin_private_score,
        dest_private_score,
        fbo_pair_score,
        is_asymmetric,
        is_return_corridor,
        short_turnaround,
        idle_then_ferry,
        one_way_ratio_7d,
        *_rest,
    ) = row

    score = (
        0.15
        + 0.28 * is_asymmetric
        + 0.14 * short_turnaround
        + 0.12 * idle_then_ferry
        + 0.18 * max(0.0, fbo_pair_score - 0.8) / 0.2
        + 0.16 * max(0.0, one_way_ratio_7d - 0.45) / 0.55
        - 0.4 * is_return_corridor
    )
    if distance_nm < 90 or distance_nm > 3200:
        score -= 0.2
    if ground_time_hours < 1.2:
        score -= 0.12

    score += rng.normal(0, 0.06)
    return int(score >= 0.48)


def _sample_base_row(rng: np.random.Generator) -> list[float]:
    origin_ps = float(np.clip(rng.beta(5, 2), 0.4, 0.99))
    dest_ps = float(np.clip(rng.beta(5, 2), 0.4, 0.99))
    is_return = float(rng.random() < 0.22)
    is_asymmetric = float((rng.random() < 0.45) and not is_return)
    ground = float(np.clip(rng.lognormal(1.4, 0.7), 0.4, 96))
    short = float(0 < ground <= 6)
    idle = float(18 <= ground <= 72)
    distance = float(np.clip(rng.lognormal(5.8, 0.55), 40, 4000))
    one_way = float(np.clip(rng.beta(2.2 if is_asymmetric else 1.5, 2.0), 0, 1))
    return [
        distance,
        ground,
        origin_ps,
        dest_ps,
        (origin_ps + dest_ps) / 2,
        is_asymmetric,
        is_return,
        short,
        idle,
        one_way,
        float(rng.integers(0, 6)),
        float(rng.integers(0, 24)),
        float(rng.integers(0, 7)),
        float(rng.integers(0, 6)),
        float(rng.choice([6, 7, 8, 9, 10, 12, 14, 16])),
        float(rng.random() < 0.85),
        float(np.clip(rng.lognormal(5.5, 0.6), 0, 4000)),
        float(rng.uniform(0, 180)),
    ]


def generate_tabular(n: int = 4000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = [_sample_base_row(rng) for _ in range(n)]
    X = np.asarray(rows, dtype=np.float64)
    y = np.asarray([_label_from_row(r, rng) for r in X], dtype=np.int64)
    df = pd.DataFrame(X, columns=FEATURE_NAMES)
    df["label"] = y
    return df


def generate_sequences(
    n: int = 2500, seed: int = 11
) -> tuple[np.ndarray, np.ndarray]:
    """Sequences of SEQ_LEN steps × FEATURE_DIM with labels tied to the story."""
    rng = np.random.default_rng(seed)
    seqs = np.zeros((n, SEQ_LEN, FEATURE_DIM), dtype=np.float32)
    y = np.zeros(n, dtype=np.int64)

    for i in range(n):
        positive = rng.random() < 0.5
        y[i] = int(positive)
        base = np.asarray(_sample_base_row(rng), dtype=np.float32)

        for t in range(SEQ_LEN):
            step = base.copy()
            step += rng.normal(0, 0.02, size=FEATURE_DIM).astype(np.float32)
            step = np.clip(step, 0, None)

            if positive:
                # Rising one-way ratio, culminating in an onward ferry.
                step[9] = np.clip(0.4 + 0.15 * t + rng.normal(0, 0.02), 0, 1)
                step[10] = float(min(5, 1 + t))
                step[0] = float(np.clip(rng.lognormal(5.9, 0.35), 120, 2800))
                if t < SEQ_LEN - 1:
                    step[5] = 0.0
                    step[6] = float(rng.random() < 0.25)
                    step[7] = float(rng.random() < 0.4)
                else:
                    step[5] = 1.0
                    step[6] = 0.0
                    step[7] = 1.0
                    step[2] = float(np.clip(rng.uniform(0.88, 0.99), 0, 1))
                    step[3] = float(np.clip(rng.uniform(0.88, 0.99), 0, 1))
                    step[4] = (step[2] + step[3]) / 2
                    step[1] = float(rng.uniform(2.0, 5.5))
            else:
                # Round-trip / return pattern with low one-way history.
                step[9] = np.clip(0.2 + rng.normal(0, 0.04), 0, 0.45)
                step[10] = float(rng.integers(0, 3))
                if t == SEQ_LEN - 1:
                    step[5] = 0.0
                    step[6] = 1.0
                    step[7] = float(rng.random() < 0.3)
                else:
                    step[5] = 0.0
                    step[6] = float(rng.random() < 0.7)

            seqs[i, t] = step

    return seqs, y
