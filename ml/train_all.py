#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from reposition_ml.train_lstm import train as train_lstm
from reposition_ml.train_xgb import train as train_xgb


def main() -> int:
    xgb = train_xgb()
    lstm = train_lstm()
    summary = {
        "xgb_auc": xgb["auc"],
        "lstm_auc": lstm["auc"],
        "models_dir": str(ROOT / "models"),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
