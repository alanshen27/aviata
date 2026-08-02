# Open training / enrichment data

Sources the ingest pipeline can pull. **Licenses matter** if you sell the product.

| Source | What you get | License / access | Used for |
|--------|--------------|------------------|----------|
| [OurAirports](https://ourairports.com/data/) | Global airports CSV | Public domain (Unlicense) | Airport match, FBO prior |
| [private-jets legs](https://github.com/jorgecardleitao/private-jets) (`fra1.digitaloceanspaces.com`) | Pre-segmented bizjet legs from ADS-B | Derived from OpenSky research data — **research/non-commercial by default**; confirm before commercial use | Leg sequences, weak empty-leg labels |
| [ADS-B Exchange basic-ac-db](https://downloads.adsbexchange.com/downloads/basic-ac-db.json.gz) | ICAO24 → reg / type / flags | Enthusiast use common; **ask ADSBx for commercial** | Private-jet type filter |
| [ADSB.lol API + history](https://www.adsb.lol/) | Live positions + daily ODbL dumps | **ODbL 1.0** (share-alike on DB) | Live ingest, optional hist traces |
| [OpenSky Network](https://opensky-network.org/data/) | REST live + Trino hist + aircraft metadata | Free for research/education; **commercial needs written license** | Preferred hist if licensed |
| [Mictronics aircraft DB](https://www.mictronics.de/aircraft-database/export.php) | Registry JSON exports | **ODC-By** | Alternative registry |
| FAA Releasable Aircraft DB | US N-number registry | US gov public data | US enrichment |

## What is *not* openly labeled

True **empty-leg / ferry** labels are almost never in open ADS-B sets. Training uses:

1. **Weak labels** from leg geometry (asymmetric onward vs return, ground time, FBO pair).
2. Later: operator FMS / marketplace confirms as hard labels.

## Empty-leg *listings* (positive labels)

See [`LISTINGS.md`](./LISTINGS.md). Quick open feed:

```bash
python3 ml/ingest/listings.py --max 200
```

## Default ingest

```bash
python3 ml/ingest/download.py          # raw files → ml/data/raw/
python3 ml/ingest/build_training.py    # features → ml/data/processed/
python3 ml/ingest/listings.py --max 200
python3 ml/metrics/evaluate_detection.py
python3 ml/train_all.py --from-open-data
```
