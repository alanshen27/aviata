#!/usr/bin/env python3
"""Download open aviation datasets into ml/data/raw/."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"

SOURCES = {
    "ourairports": {
        "url": "https://davidmegginson.github.io/ourairports-data/airports.csv",
        "path": RAW / "ourairports_airports.csv",
        "license": "Unlicense / public domain",
    },
    "basic_ac_db": {
        "url": "https://downloads.adsbexchange.com/downloads/basic-ac-db.json.gz",
        "path": RAW / "basic-ac-db.json.gz",
        "license": "ADS-B Exchange — confirm commercial terms",
    },
    "private_jets_legs_sample": {
        "url": "https://private-jets.fra1.digitaloceanspaces.com/leg/v2/all/year=2023/data.csv",
        "path": RAW / "private_jets_legs_2023_sample.csv",
        "license": "Derived OpenSky research legs — non-commercial unless licensed",
        "max_bytes": 12_000_000,
    },
}

ADSBLOL_POINTS = {
    "TEB": (40.85, -74.06, 40),
    "VNY": (34.21, -118.49, 40),
    "OPF": (25.91, -80.28, 40),
    "SIN": (1.36, 103.99, 80),
    "LBG": (48.97, 2.44, 40),
    "HKG": (22.31, 113.92, 50),
}


def _fetch(url: str, dest: Path, max_bytes: int | None = None) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "reposition-ingest/0.1 (research; open-data)"},
    )
    if max_bytes is not None:
        req.add_header("Range", f"bytes=0-{max_bytes - 1}")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
    except urllib.error.HTTPError as exc:
        return {"ok": False, "url": url, "error": str(exc), "path": str(dest)}

    # Range downloads can truncate mid-line; keep complete lines only.
    if max_bytes is not None and not data.endswith(b"\n"):
        data = data.rsplit(b"\n", 1)[0] + b"\n"

    dest.write_bytes(data)
    return {
        "ok": True,
        "url": url,
        "path": str(dest),
        "bytes": len(data),
    }


def download_static(names: list[str] | None = None) -> list[dict]:
    results = []
    items = SOURCES.items()
    if names:
        items = [(k, v) for k, v in SOURCES.items() if k in names]
    for key, meta in items:
        print(f"↓ {key}: {meta['url']}", flush=True)
        result = _fetch(meta["url"], meta["path"], meta.get("max_bytes"))
        result["source"] = key
        result["license"] = meta["license"]
        results.append(result)
        status = "ok" if result["ok"] else "FAIL"
        print(f"  {status} → {result.get('path')} ({result.get('bytes', result.get('error'))})")
    return results


def download_adsblol_live() -> list[dict]:
    out_dir = RAW / "adsblol_live"
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for name, (lat, lon, radius) in ADSBLOL_POINTS.items():
        url = f"https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}"
        dest = out_dir / f"{name}.json"
        print(f"↓ adsblol:{name}", flush=True)
        result = _fetch(url, dest)
        result["source"] = f"adsblol_{name}"
        result["license"] = "ODbL 1.0"
        if result["ok"]:
            try:
                payload = json.loads(dest.read_text())
                result["aircraft"] = len(payload.get("ac") or [])
            except json.JSONDecodeError:
                result["aircraft"] = None
        results.append(result)
        print(
            f"  {'ok' if result['ok'] else 'FAIL'} → {dest.name} "
            f"({result.get('aircraft', result.get('error'))} ac)"
        )
    return results


def write_manifest(results: list[dict]) -> Path:
    manifest = RAW / "manifest.json"
    manifest.write_text(json.dumps(results, indent=2))
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        nargs="*",
        help="Subset of static sources: ourairports basic_ac_db private_jets_legs_sample",
    )
    parser.add_argument("--skip-live", action="store_true")
    args = parser.parse_args()

    results = download_static(args.only)
    if not args.skip_live:
        results.extend(download_adsblol_live())
    path = write_manifest(results)
    ok = sum(1 for r in results if r.get("ok"))
    print(json.dumps({"downloaded": ok, "total": len(results), "manifest": str(path)}, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    raise SystemExit(main())
