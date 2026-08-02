#!/usr/bin/env python3
"""Download and normalize publicly listed empty legs (Limitless Sky RSS)."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

DEFAULT_URL = "https://thelimitlesssky.com/api/public/empty-legs/rss.xml"

TITLE_RE = re.compile(
    r"^(?P<origin_city>.+?)\s*\((?P<origin>[A-Z0-9]{3,4})\)\s*→\s*"
    r"(?P<dest_city>.+?)\s*\((?P<dest>[A-Z0-9]{3,4})\)\s*·\s*(?P<price>.+)$"
)


def fetch_rss(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "reposition-listings/0.1 (research; empty-leg labels)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def parse_items(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    channel = root.find("channel")
    if channel is None:
        return []

    channel_desc = (channel.findtext("description") or "").strip()
    items = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or "").strip()
        desc = (item.findtext("description") or "").strip()
        pub = item.findtext("pubDate")
        cats = [c.text.strip() for c in item.findall("category") if c.text]

        m = TITLE_RE.match(title)
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)

        origin = (m.group("origin") if m else (qs.get("from") or [None])[0])
        dest = (m.group("dest") if m else (qs.get("to") or [None])[0])
        price_text = m.group("price") if m else None
        date = (qs.get("date") or [None])[0]
        aircraft = urllib.parse.unquote((qs.get("aircraft") or [""])[0]).replace("+", " ")
        leg_id = (qs.get("legId") or [None])[0]

        pub_iso = None
        if pub:
            try:
                pub_iso = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
            except (TypeError, ValueError, IndexError):
                pub_iso = None

        row = {
            "listing_id": guid or (f"leg-{leg_id}" if leg_id else None),
            "source": "limitless_sky_rss",
            "origin_iata": origin,
            "destination_iata": dest,
            "departure_date": date,
            "aircraft": aircraft or (cats[0] if cats else None),
            "category": cats[1] if len(cats) > 1 else None,
            "price_text": price_text,
            "title": title,
            "url": link,
            "description": desc,
            "published_at": pub_iso,
            "label": 1,
            "label_source": "listing",
        }
        # Stable content hash for deterministic fixture diffs
        row["content_hash"] = hashlib.sha256(
            json.dumps(row, sort_keys=True, default=str).encode()
        ).hexdigest()[:16]
        items.append(row)

    return items, channel_desc


def listings_to_eval_features(listings: list[dict]) -> list[dict]:
    """
    Build pseudo feature rows for listed empty legs so detectors can be scored
    against marketplace positives (not ADS-B-joined).
    """
    from ingest.build_training import (  # type: ignore
        FBO_SCORES,
        aircraft_class_ord,
        private_score,
    )

    # Local import path fix when run as script
    sys.path.insert(0, str(ROOT.parent))

    rows = []
    for leg in listings:
        origin = (leg.get("origin_iata") or "").upper()
        dest = (leg.get("destination_iata") or "").upper()
        if not origin or not dest:
            continue
        # Map IATA-ish to our FBO score table via common K-prefix US airports
        o_icao = origin if len(origin) == 4 else f"K{origin}"
        d_icao = dest if len(dest) == 4 else f"K{dest}"
        o_score = private_score(o_icao if o_icao in FBO_SCORES else origin)
        d_score = private_score(d_icao if d_icao in FBO_SCORES else dest)
        if o_icao in FBO_SCORES:
            o_score = FBO_SCORES[o_icao]
        if d_icao in FBO_SCORES:
            d_score = FBO_SCORES[d_icao]

        class_ord, seats = aircraft_class_ord(str(leg.get("aircraft") or ""))
        # Listed empty legs are onward ferries by definition → asymmetric prior
        features = {
            "distance_nm": 800.0,  # unknown from RSS; mid-range prior
            "ground_time_hours": 4.0,
            "origin_private_score": o_score,
            "dest_private_score": d_score,
            "fbo_pair_score": round((o_score + d_score) / 2, 3),
            "is_asymmetric": 1.0,
            "is_return_corridor": 0.0,
            "short_turnaround": 1.0,
            "idle_then_ferry": 0.0,
            "one_way_ratio_7d": 0.7,
            "legs_last_48h": 2.0,
            "hour_of_day_utc": 14.0,
            "dow": 2.0,
            "aircraft_class_ord": float(class_ord),
            "typical_seats": float(seats),
            "same_country": 1.0,
            "prior_leg_distance_nm": 900.0,
            "heading_delta_deg": 120.0,
            "label": 1,
            "label_source": "listing",
            "listing_id": leg.get("listing_id"),
            "origin_iata": origin,
            "destination_iata": dest,
            "aircraft": leg.get("aircraft"),
            "departure_date": leg.get("departure_date"),
        }
        rows.append(features)
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--max", type=int, default=200)
    parser.add_argument("--from-airport", dest="from_airport")
    parser.add_argument("--to-airport", dest="to_airport")
    args = parser.parse_args()

    qs = {"max": str(min(args.max, 200))}
    if args.from_airport:
        qs["from"] = args.from_airport
    if args.to_airport:
        qs["to"] = args.to_airport
    url = args.url + ("&" if "?" in args.url else "?") + urllib.parse.urlencode(qs)

    RAW.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)

    print(f"↓ listings: {url}", flush=True)
    xml_bytes = fetch_rss(url)
    raw_path = RAW / "empty_legs_rss.xml"
    raw_path.write_bytes(xml_bytes)

    items, channel_desc = parse_items(xml_bytes)
    out_json = PROCESSED / "listed_empty_legs.json"
    out_json.write_text(json.dumps(items, indent=2))

    # Fix import path for feature builder helper
    sys.path.insert(0, str(ROOT / "ingest"))
    sys.path.insert(0, str(ROOT))
    # Inline feature build to avoid circular import issues
    feature_rows = _listing_features(items)
    feat_path = PROCESSED / "listed_empty_leg_features.csv"
    import csv

    if feature_rows:
        with feat_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(feature_rows[0].keys()))
            w.writeheader()
            w.writerows(feature_rows)

    summary = {
        "source": "limitless_sky_rss",
        "url": url,
        "channel": channel_desc,
        "count": len(items),
        "feature_rows": len(feature_rows),
        "raw": str(raw_path),
        "json": str(out_json),
        "features_csv": str(feat_path) if feature_rows else None,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "sample": [
            {
                "origin": i.get("origin_iata"),
                "destination": i.get("destination_iata"),
                "aircraft": i.get("aircraft"),
                "departure_date": i.get("departure_date"),
                "price_text": i.get("price_text"),
            }
            for i in items[:5]
        ],
    }
    (PROCESSED / "listings_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0 if items else 2


def _listing_features(listings: list[dict]) -> list[dict]:
    FBO_SCORES = {
        "KTEB": 0.98,
        "KVNY": 0.96,
        "KOPF": 0.93,
        "KASE": 0.95,
        "KHPN": 0.92,
        "KPBI": 0.90,
        "KAPA": 0.88,
        "KSDL": 0.91,
        "LFPB": 0.97,
        "LSGG": 0.94,
        "EGGW": 0.89,
        "LFMN": 0.93,
        "WSSS": 0.86,
        "ZSPD": 0.80,
        "VHHH": 0.88,
    }

    def class_ord(model: str) -> tuple[int, int]:
        m = (model or "").upper()
        if any(x in m for x in ("G650", "GLOBAL", "G550", "FALCON 7", "FALCON 8")):
            return 5, 14
        if any(x in m for x in ("G450", "CHALLENGER 6", "LEGACY")):
            return 4, 12
        if any(x in m for x in ("CITATION X", "LATITUDE", "XLS", "CL30", "CL35", "G280", "LEAR")):
            return 3, 10
        if any(x in m for x in ("PHENOM", "CITATION", "HAWKER", "PC-24")):
            return 2, 8
        if "CJ" in m:
            return 1, 7
        return 2, 8

    rows = []
    for leg in listings:
        origin = (leg.get("origin_iata") or "").upper()
        dest = (leg.get("destination_iata") or "").upper()
        if not origin or not dest:
            continue
        o_icao = origin if len(origin) == 4 else f"K{origin}"
        d_icao = dest if len(dest) == 4 else f"K{dest}"
        o_score = FBO_SCORES.get(o_icao, FBO_SCORES.get(origin, 0.55))
        d_score = FBO_SCORES.get(d_icao, FBO_SCORES.get(dest, 0.55))
        class_i, seats = class_ord(str(leg.get("aircraft") or ""))
        rows.append(
            {
                "distance_nm": 800.0,
                "ground_time_hours": 4.0,
                "origin_private_score": o_score,
                "dest_private_score": d_score,
                "fbo_pair_score": round((o_score + d_score) / 2, 3),
                "is_asymmetric": 1.0,
                "is_return_corridor": 0.0,
                "short_turnaround": 1.0,
                "idle_then_ferry": 0.0,
                "one_way_ratio_7d": 0.7,
                "legs_last_48h": 2.0,
                "hour_of_day_utc": 14.0,
                "dow": 2.0,
                "aircraft_class_ord": float(class_i),
                "typical_seats": float(seats),
                "same_country": 1.0,
                "prior_leg_distance_nm": 900.0,
                "heading_delta_deg": 120.0,
                "label": 1,
                "label_source": "listing",
                "listing_id": leg.get("listing_id"),
                "origin_iata": origin,
                "destination_iata": dest,
            }
        )
    return rows


if __name__ == "__main__":
    raise SystemExit(main())
