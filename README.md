# AVIATA

Detect private-jet **empty legs** from ADS-B OSINT, score them with **XGBoost + LSTM**, and sell alerts / seats.

## What it does

1. **Ingest OSINT** — demo legs today; optional OpenSky live snapshot (`GET /api/collect`, research license only).
2. **Engineer features** — distance, ground time, FBO airport scores, route asymmetry, turnaround / idle-ferry flags, one-way history.
3. **Classify empty legs**
   - **XGBoost** — tabular `P(empty_leg)`
   - **LSTM** — sequence model over the last few legs for a tail
   - **Ensemble** — `0.45·xgb + 0.35·lstm + 0.20·heuristic`
4. **Recommend to travelers (Transformer)**
   - Learns home base + corridor stay length (e.g. SIN→PVG ~7 days)
   - When the return window opens, ranks homebound empty legs (`GET /api/recommend`)
5. **Sell** — public board (Scout) + paid Radar/Broker alert signup (`POST /api/alerts`).

## Quick start

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Open training data + ingest

See [`ml/data/SOURCES.md`](ml/data/SOURCES.md) for licenses.

```bash
npm run data:ingest          # OurAirports + private-jet legs sample + ADSBx registry + ADSB.lol live
npm run ml:train:open        # XGBoost on weakly labeled open legs (+ some synthetic mix)
```

Status JSON: `GET /api/data`

### Listings + deterministic metrics

Empty legs are listed on marketplaces (see [`ml/data/LISTINGS.md`](ml/data/LISTINGS.md)).
Open feed ingest + hash-stable detection metrics:

```bash
npm run metrics                 # listings RSS + detection_metrics.json
# or:
npm run data:listings && npm run metrics:detection
```

Report: `ml/metrics/reports/detection_metrics.json` · API: `GET /api/metrics`

### Train the Python models

```bash
python3 -m pip install -r ml/requirements.txt
python3 ml/train_all.py
# or after ingest:
python3 ml/train_all.py --from-open-data
```

After training, `ml/models/` holds `xgb_emptyleg.joblib` and `lstm_emptyleg.pt`. The Next.js detector calls `ml/infer.py` when available and falls back to a builtin ensemble otherwise.

Score a candidate:

```bash
curl -s localhost:3000/api/score -H 'content-type: application/json' -d '{
  "icao24":"a12bc3",
  "registration":"N425QS",
  "typecode":"C68A",
  "origin":"TEB",
  "destination":"OPF",
  "groundTimeHours":3.5,
  "priorOrigin":"OPF",
  "priorDestination":"ASE",
  "oneWayRatio7d":0.71
}'
```

## Monetization sketch

| Plan   | Price  | Product                         |
|--------|--------|---------------------------------|
| Scout  | Free   | Delayed public board            |
| Radar  | $49/mo | Real-time corridor alerts       |
| Broker | $299/mo| API + webhooks for desks        |

Wire Stripe on `pending_payment` subscriptions before charging.

## Data / legal

- **ADS-B** positions are broadcast publicly, but **redistribution and commercial products** are constrained by each network’s terms.
- **OpenSky** free API is for non-profit research/education; commercial/operational use needs a written license.
- For a sellable product, budget for a **commercial ADS-B feed** and/or **operator FMS** integrations (Leon, FL3XX, etc.) — OSINT alone is a lead signal, not a booking guarantee.
- Empty-leg **prices in this demo are estimates**, not operator quotes.

## Layout

```
src/lib/           feature engineering, detector, demo board, OpenSky collector
src/lib/ml/        TS bridge + builtin ensemble fallback
src/app/api/       /legs /score /alerts /collect
ml/                XGBoost + LSTM training & inference (Python)
```

## Deploy / secrets

- API keys checklist: [`docs/API_KEYS.md`](docs/API_KEYS.md)
- Render Blueprint IaC: [`render.yaml`](render.yaml) · [`docs/RENDER.md`](docs/RENDER.md)

## Next hard steps

1. Registry enrichment (ICAO type / operator) on live hex codes.
2. Persistent flight segmentation from ADS-B traces.
3. Labels from operator-confirmed empty legs → retrain XGB/LSTM.
4. Stripe + email/SMS alerting.
5. Broker API keys + webhooks.
