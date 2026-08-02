#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from reposition_ml.train_lstm import train as train_lstm
from reposition_ml.train_transformer import train as train_transformer
from reposition_ml.train_xgb import train as train_xgb


def main() -> int:
    parser = argparse.ArgumentParser(description="Train empty-leg + return models")
    parser.add_argument(
        "--from-open-data",
        action="store_true",
        help="Train XGBoost on ml/data/processed/emptyleg_open_features.csv",
    )
    parser.add_argument(
        "--mix-synthetic",
        type=float,
        default=0.25,
        help="When using open data, mix this fraction of synthetic rows",
    )
    args = parser.parse_args()

    xgb = train_xgb(
        from_open_data=args.from_open_data,
        mix_synthetic=args.mix_synthetic,
    )
    lstm = train_lstm()
    transformer = train_transformer()
    summary = {
        "xgb_auc": xgb["auc"],
        "xgb_data_source": xgb.get("data_source"),
        "xgb_rows": xgb.get("rows"),
        "lstm_auc": lstm["auc"],
        "transformer_return_auc": transformer["auc"],
        "models_dir": str(ROOT / "models"),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
