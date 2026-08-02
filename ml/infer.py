#!/usr/bin/env python3
"""JSON-in / JSON-out inference for the Next.js detector bridge."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from reposition_ml.ensemble import score  # noqa: E402


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "empty stdin"}))
        return 1
    payload = json.loads(raw)
    features = payload.get("features")
    if not isinstance(features, list):
        print(json.dumps({"error": "features must be a list"}))
        return 1
    sequence = payload.get("sequence")
    result = score(features, sequence)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
