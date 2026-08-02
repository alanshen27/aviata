#!/usr/bin/env python3
"""Build weakly-labeled training rows from open private-jet legs + airports."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

# Keep in sync with reposition_ml.features.FEATURE_NAMES
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

# ICAO typecodes / model substrings treated as charter-relevant.
BIZJET_NEEDLES = (
    "GULFSTREAM",
    "CHALLENGER",
    "GLOBAL",
    "FALCON",
    "CITATION",
    "PHENOM",
    "LEGACY",
    "HAWKER",
    "EMBRAER PREDATOR",  # unlikely
    "BOMBARDIER",
    "CESSNA 525",
    "CESSNA 560",
    "CESSNA 680",
    "CESSNA 700",
    "CESSNA 750",
    "LEARJET",
    "PILATUS PC-24",
    "PC-24",
    "CL-600",
    "CL-30",
    "G200",
    "G280",
    "G450",
    "G550",
    "G650",
    "G700",
)

# High private-aviation airports (ICAO) — scores mirror product priors.
FBO_SCORES = {
    "KTEB": 0.98,
    "KVNY": 0.96,
    "KOPF": 0.93,
    "KASE": 0.95,
    "KHPN": 0.92,
    "KPBI": 0.90,
    "KAPA": 0.88,
    "KSDL": 0.91,
    "KBFI": 0.85,
    "KDAL": 0.80,
    "KHOU": 0.78,
    "KLAS": 0.72,
    "LFPB": 0.97,
    "LSGG": 0.94,
    "EGGW": 0.89,
    "LFMN": 0.93,
    "WSSS": 0.86,
    "ZSPD": 0.80,
    "ZSSS": 0.78,
    "ZBAA": 0.76,
    "VHHH": 0.88,
    "VTBS": 0.74,
}


def haversine_nm(lat1, lon1, lat2, lon2) -> float:
    r = 3440.065
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p)
        * math.cos(lat2 * p)
        * math.sin((lon2 - lon1) * p / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def bearing_deg(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    φ1, φ2 = lat1 * p, lat2 * p
    Δλ = (lon2 - lon1) * p
    y = math.sin(Δλ) * math.cos(φ2)
    x = math.cos(φ1) * math.sin(φ2) - math.sin(φ1) * math.cos(φ2) * math.cos(Δλ)
    return (math.atan2(y, x) * 180 / math.pi + 360) % 360


def angular_delta(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def load_airports(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                lat = float(row["latitude_deg"])
                lon = float(row["longitude_deg"])
            except (KeyError, TypeError, ValueError):
                continue
            icao = (row.get("icao_code") or row.get("gps_code") or "").strip().upper()
            if not icao:
                continue
            rows.append(
                {
                    "icao": icao,
                    "iata": (row.get("iata_code") or "").strip().upper() or None,
                    "lat": lat,
                    "lon": lon,
                    "country": (row.get("iso_country") or "").strip().upper(),
                    "type": row.get("type") or "",
                }
            )
    return rows


def build_airport_grid(airports: list[dict], cell_deg: float = 2.0):
    grid: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for a in airports:
        key = (int(a["lat"] // cell_deg), int(a["lon"] // cell_deg))
        grid[key].append(a)
    return grid, cell_deg


def nearest_airport(
    lat: float,
    lon: float,
    airports: list[dict],
    max_nm: float = 40,
    grid: dict | None = None,
    cell_deg: float = 2.0,
):
    candidates = airports
    if grid is not None:
        i, j = int(lat // cell_deg), int(lon // cell_deg)
        bag: list[dict] = []
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                bag.extend(grid.get((i + di, j + dj), []))
        candidates = bag or airports

    best = None
    best_nm = max_nm
    for a in candidates:
        nm = haversine_nm(lat, lon, a["lat"], a["lon"])
        if nm < best_nm:
            best_nm = nm
            best = a
    return best, best_nm


def private_score(icao: str | None, airport_type: str = "") -> float:
    if icao and icao in FBO_SCORES:
        return FBO_SCORES[icao]
    if airport_type in {"large_airport", "medium_airport"}:
        return 0.55
    if airport_type == "small_airport":
        return 0.45
    return 0.35


def is_bizjet_model(model: str) -> bool:
    upper = (model or "").upper()
    return any(n in upper for n in BIZJET_NEEDLES)


def load_bizjet_hexes(path: Path) -> set[str]:
    """Optional filter from ADSBx basic-ac-db (ndjson gzip)."""
    if not path.exists():
        return set()
    hexes: set[str] = set()
    # File is JSON lines or a JSON array depending on vintage — try both.
    with gzip.open(path, "rt", encoding="utf-8", errors="ignore") as f:
        first = f.read(1)
        if not first:
            return set()
        rest = first + f.read()
    rest = rest.strip()
    try:
        if rest.startswith("["):
            rows = json.loads(rest)
            for row in rows:
                icao = str(row.get("icao") or row.get("hex") or "").lower()
                t = str(row.get("icaotype") or row.get("t") or "").upper()
                desc = str(row.get("desc") or row.get("mdl") or "").upper()
                if icao and (t in _TYPECODES or any(n in desc for n in BIZJET_NEEDLES)):
                    hexes.add(icao)
        else:
            for line in rest.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                icao = str(row.get("icao") or row.get("hex") or "").lower()
                t = str(row.get("icaotype") or row.get("t") or "").upper()
                desc = str(row.get("desc") or row.get("mdl") or "").upper()
                if icao and (t in _TYPECODES or any(n in desc for n in BIZJET_NEEDLES)):
                    hexes.add(icao)
    except Exception:
        return set()
    return hexes


_TYPECODES = {
    "C25A",
    "C25B",
    "C25C",
    "C56X",
    "C680",
    "C68A",
    "C700",
    "C750",
    "CL30",
    "CL35",
    "CL60",
    "G150",
    "GALX",
    "G280",
    "GLF4",
    "GLF5",
    "GLF6",
    "GLEX",
    "GL5T",
    "FA7X",
    "FA8X",
    "F2TH",
    "E55P",
    "E35L",
    "PC24",
    "H25B",
    "LJ45",
    "LJ60",
    "C25M",
}


def aircraft_class_ord(model: str) -> tuple[int, int]:
    m = (model or "").upper()
    if any(x in m for x in ("G650", "G700", "GLOBAL", "GLEX", "FA7X", "FA8X", "G550", "GLF5", "GLF6")):
        return 5, 14
    if any(x in m for x in ("G450", "GLF4", "CHALLENGER 600", "CL-600", "LEGACY", "E35L")):
        return 4, 12
    if any(x in m for x in ("G200", "G280", "GALX", "CITATION X", "C750", "C700", "CL30", "CL35", "F2TH", "LATITUDE", "SOVEREIGN")):
        return 3, 10
    if any(x in m for x in ("CITATION", "C56X", "HAWKER", "PHENOM", "PC-24", "PC24")):
        return 2, 8
    if "CJ" in m or "C25" in m:
        return 1, 7
    return 2, 8


def weak_label(features: dict) -> int:
    score = (
        0.15
        + 0.28 * features["is_asymmetric"]
        + 0.14 * features["short_turnaround"]
        + 0.12 * features["idle_then_ferry"]
        + 0.18 * max(0.0, features["fbo_pair_score"] - 0.8) / 0.2
        + 0.16 * max(0.0, features["one_way_ratio_7d"] - 0.45) / 0.55
        - 0.4 * features["is_return_corridor"]
    )
    if features["distance_nm"] < 90 or features["distance_nm"] > 3200:
        score -= 0.2
    if features["ground_time_hours"] < 1.2:
        score -= 0.12
    return int(score >= 0.48)


def load_legs(path: Path) -> pd.DataFrame:
    # Engine python handles messy truncated samples better.
    df = pd.read_csv(path, on_bad_lines="skip", engine="python")
    needed = {
        "icao_number",
        "tail_number",
        "aircraft_model",
        "start",
        "start_lat",
        "start_lon",
        "end",
        "end_lat",
        "end_lon",
        "great_circle_distance",
    }
    missing = needed - set(df.columns)
    if missing:
        raise SystemExit(f"legs file missing columns: {missing}")
    df = df.dropna(subset=["start", "end", "start_lat", "start_lon", "end_lat", "end_lon"])
    df = df[df["aircraft_model"].astype(str).map(is_bizjet_model)]
    df["start_dt"] = df["start"].map(parse_ts)
    df["end_dt"] = df["end"].map(parse_ts)
    df = df.sort_values(["icao_number", "start_dt"])
    return df


def build_rows(df: pd.DataFrame, airports: list[dict], limit: int | None = None) -> pd.DataFrame:
    rows: list[dict] = []
    grouped = df.groupby("icao_number", sort=False)
    grid, cell_deg = build_airport_grid(airports)

    def near(lat: float, lon: float):
        return nearest_airport(
            lat, lon, airports, max_nm=45, grid=grid, cell_deg=cell_deg
        )

    for icao, group in grouped:
        legs = group.to_dict("records")
        for i in range(1, len(legs)):
            prev = legs[i - 1]
            cur = legs[i]
            ground_h = (cur["start_dt"] - prev["end_dt"]).total_seconds() / 3600.0
            if ground_h < 0 or ground_h > 14 * 24:
                continue

            origin, _ = near(cur["start_lat"], cur["start_lon"])
            dest, _ = near(cur["end_lat"], cur["end_lon"])
            if not origin or not dest:
                continue

            prior_origin, _ = near(prev["start_lat"], prev["start_lon"])
            prior_dest, _ = near(prev["end_lat"], prev["end_lon"])

            continues = bool(prior_dest and prior_dest["icao"] == origin["icao"])
            is_return = bool(
                continues
                and prior_origin
                and prior_origin["icao"] == dest["icao"]
            )
            is_asymmetric = float(continues and not is_return)

            # Rolling one-way ratio over prior week for this tail.
            window_start = cur["start_dt"].timestamp() - 7 * 86400
            recent = [
                L
                for L in legs[: i + 1]
                if L["start_dt"].timestamp() >= window_start
            ]
            one_ways = 0
            pairs = 0
            for j in range(1, len(recent)):
                a, b = recent[j - 1], recent[j]
                ao, _ = near(a["start_lat"], a["start_lon"])
                ad, _ = near(a["end_lat"], a["end_lon"])
                bo, _ = near(b["start_lat"], b["start_lon"])
                bd, _ = near(b["end_lat"], b["end_lon"])
                if not (ao and ad and bo and bd):
                    continue
                if ad["icao"] != bo["icao"]:
                    continue
                pairs += 1
                if ao["icao"] != bd["icao"]:
                    one_ways += 1
            one_way_ratio = (one_ways / pairs) if pairs else 0.5

            legs_48h = sum(
                1
                for L in legs[: i + 1]
                if 0
                <= (cur["start_dt"] - L["start_dt"]).total_seconds()
                <= 48 * 3600
            )

            distance_nm = float(cur.get("great_circle_distance") or 0) / 1.852
            if distance_nm <= 0:
                distance_nm = haversine_nm(
                    cur["start_lat"], cur["start_lon"], cur["end_lat"], cur["end_lon"]
                )

            prior_distance_nm = float(prev.get("great_circle_distance") or 0) / 1.852
            if prior_distance_nm <= 0:
                prior_distance_nm = haversine_nm(
                    prev["start_lat"],
                    prev["start_lon"],
                    prev["end_lat"],
                    prev["end_lon"],
                )

            heading = angular_delta(
                bearing_deg(prev["start_lat"], prev["start_lon"], prev["end_lat"], prev["end_lon"]),
                bearing_deg(cur["start_lat"], cur["start_lon"], cur["end_lat"], cur["end_lon"]),
            )

            class_ord, seats = aircraft_class_ord(str(cur["aircraft_model"]))
            o_score = private_score(origin["icao"], origin.get("type", ""))
            d_score = private_score(dest["icao"], dest.get("type", ""))

            features = {
                "distance_nm": round(distance_nm, 1),
                "ground_time_hours": round(ground_h, 2),
                "origin_private_score": o_score,
                "dest_private_score": d_score,
                "fbo_pair_score": round((o_score + d_score) / 2, 3),
                "is_asymmetric": is_asymmetric,
                "is_return_corridor": float(is_return),
                "short_turnaround": float(0 < ground_h <= 6),
                "idle_then_ferry": float(18 <= ground_h <= 72),
                "one_way_ratio_7d": round(one_way_ratio, 3),
                "legs_last_48h": float(legs_48h),
                "hour_of_day_utc": float(cur["start_dt"].hour),
                "dow": float(cur["start_dt"].weekday()),
                "aircraft_class_ord": float(class_ord),
                "typical_seats": float(seats),
                "same_country": float(origin["country"] == dest["country"]),
                "prior_leg_distance_nm": round(prior_distance_nm, 1),
                "heading_delta_deg": round(heading, 1),
            }
            features["label"] = weak_label(features)
            features["icao24"] = icao
            features["tail_number"] = cur.get("tail_number")
            features["aircraft_model"] = cur.get("aircraft_model")
            features["origin_icao"] = origin["icao"]
            features["dest_icao"] = dest["icao"]
            features["departed_at"] = cur["start_dt"].isoformat()
            features["label_source"] = "weak_geometry"
            rows.append(features)
            if limit and len(rows) >= limit:
                return pd.DataFrame(rows)

    return pd.DataFrame(rows)


def build_live_snapshot_summary() -> dict:
    live_dir = RAW / "adsblol_live"
    summary = {"points": {}, "bizjet_like": 0}
    if not live_dir.exists():
        return summary
    for path in sorted(live_dir.glob("*.json")):
        payload = json.loads(path.read_text())
        ac = payload.get("ac") or []
        biz = [
            a
            for a in ac
            if str(a.get("t") or "").upper() in _TYPECODES
            or any(
                n in str(a.get("desc") or a.get("t") or "").upper()
                for n in ("GLF", "GLEX", "CL3", "C25", "C56", "C68", "FA7", "E55")
            )
        ]
        summary["points"][path.stem] = {
            "aircraft": len(ac),
            "bizjet_typecode_hits": len(biz),
            "samples": [
                {
                    "hex": a.get("hex"),
                    "r": a.get("r"),
                    "t": a.get("t"),
                    "flight": (a.get("flight") or "").strip(),
                }
                for a in biz[:5]
            ],
        }
        summary["bizjet_like"] += len(biz)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--legs",
        type=Path,
        default=RAW / "private_jets_legs_2023_sample.csv",
    )
    parser.add_argument(
        "--airports",
        type=Path,
        default=RAW / "ourairports_airports.csv",
    )
    parser.add_argument("--limit", type=int, default=20000)
    args = parser.parse_args()

    PROCESSED.mkdir(parents=True, exist_ok=True)

    if not args.legs.exists():
        print(f"Missing legs file: {args.legs}. Run ml/ingest/download.py first.")
        return 1
    if not args.airports.exists():
        print(f"Missing airports file: {args.airports}. Run ml/ingest/download.py first.")
        return 1

    print("Loading airports…", flush=True)
    airports = load_airports(args.airports)
    # Speed: keep medium/large + known FBO ICAOs only for nearest search.
    airports = [
        a
        for a in airports
        if a["icao"] in FBO_SCORES
        or a["type"] in {"large_airport", "medium_airport"}
    ]
    print(f"  airport index size: {len(airports)}")

    print("Loading legs…", flush=True)
    legs = load_legs(args.legs)
    print(f"  bizjet legs: {len(legs)} tails={legs['icao_number'].nunique()}")

    print("Building feature rows…", flush=True)
    # Pre-filter airport list spatially would be nicer; for sample size this is ok
    # if we further reduce airports with a grid — use FBO+large only already.

    # To keep runtime sane on samples, use a compact KD-style subset:
    # already filtered. Still O(n_airports) per lookup — reduce further to
    # airports near any leg endpoint bbox.
    lats = pd.concat([legs["start_lat"], legs["end_lat"]])
    lons = pd.concat([legs["start_lon"], legs["end_lon"]])
    lat_min, lat_max = float(lats.min()) - 2, float(lats.max()) + 2
    lon_min, lon_max = float(lons.min()) - 2, float(lons.max()) + 2
    airports = [
        a
        for a in airports
        if lat_min <= a["lat"] <= lat_max and lon_min <= a["lon"] <= lon_max
    ]
    print(f"  airports in bbox: {len(airports)}")

    features = build_rows(legs, airports, limit=args.limit)
    out_csv = PROCESSED / "emptyleg_open_features.csv"
    out_parquet = PROCESSED / "emptyleg_open_features.parquet"
    features.to_csv(out_csv, index=False)
    try:
        features.to_parquet(out_parquet, index=False)
    except Exception:
        out_parquet = None

    live = build_live_snapshot_summary()
    (PROCESSED / "adsblol_live_summary.json").write_text(json.dumps(live, indent=2))

    summary = {
        "rows": int(len(features)),
        "positive_rate": float(features["label"].mean()) if len(features) else 0,
        "unique_tails": int(features["icao24"].nunique()) if len(features) else 0,
        "csv": str(out_csv),
        "parquet": str(out_parquet) if out_parquet else None,
        "live_bizjet_like": live.get("bizjet_like", 0),
        "label_note": "Weak labels from geometry — not operator-confirmed empty legs",
    }
    (PROCESSED / "build_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0 if len(features) else 2


if __name__ == "__main__":
    raise SystemExit(main())
