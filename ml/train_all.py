#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from reposition_ml.train_lstm import train as train_lstm
from reposition_ml.train_transformer import train as train_transformer
from reposition_ml.train_xgb import train as train_xgb


def main() -> int:
    xgb = train_xgb()
    lstm = train_lstm()
    transformer = train_transformer()
    summary = {
        "xgb_auc": xgb["auc"],
        "lstm_auc": lstm["auc"],
        "transformer_return_auc": transformer["auc"],
        "models_dir": str(ROOT / "models"),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
