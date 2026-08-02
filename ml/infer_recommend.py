#!/usr/bin/env python3
"""JSON-in / JSON-out return-trip recommendation inference."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from reposition_ml.recommend_infer import score_return  # noqa: E402


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "empty stdin"}))
        return 1
    payload = json.loads(raw)
    result = score_return(payload)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
