# Where empty legs are listed

Public / semi-public places operators and brokers publish repositioning inventory.
Use these as **positive labels** (a listed leg was intended empty / for sale).
They are not ADS-B truth, and availability decays quickly.

## Open / easy to ingest

| Source | Access | Notes |
|--------|--------|-------|
| [Limitless Sky RSS](https://thelimitlesssky.com/api/public/empty-legs/rss.xml) | Free public RSS, ~15 min refresh, CORS open | Best open feed today. Params: `from`, `to`, `fromDate`, `toDate`, `max`. Ingest: `python ml/ingest/listings.py` |
| Operator marketing pages | HTML scrape (ToS!) | Chartright, PrivateFly blogs, regional operators — brittle |

## Industry marketplaces (need accounts / contracts)

| Source | Access | Notes |
|--------|--------|-------|
| [Avinode Empty Legs API](https://developer.avinodegroup.com/docs/end-client-empty-leg-search) | Partner API (`POST /emptylegs/search`, watches/webhooks) | De facto broker marketplace standard |
| [FL3XX](https://www.fl3xx.com/) | Operator FMS API (`/api/external/quote/legs/empty`) | Direct from schedules — strongest “true empty” signal |
| Leon | Operator FMS | Same class as FL3XX when connected |
| PrivateLegs, EmptyJet, Jettly, XO, VistaJet | Web / partner | Consumer-facing boards; APIs usually closed |

## OSINT (not listings — detection inputs)

| Source | Role |
|--------|------|
| ADS-B (ADSB.lol ODbL, OpenSky research, ADSBx commercial) | Observe aircraft motion; infer likely empty |
| [private-jets legs dataset](https://github.com/jorgecardleitao/private-jets) | Segmented historical bizjet legs |

## Label strategy

1. **Listed positive** — RSS / Avinode / FMS empty-leg row ⇒ `label=1`, `label_source=listing`.
2. **Hard negative** — same-day bizjet legs whose OD∉ listing set and look like round-trip passenger patterns.
3. **Weak geometry** — asymmetry / turnaround heuristics (current open-data builder) — good for bootstrap, leaks into features.

Production accuracy claims should cite **listing-anchored** or **operator-confirmed** metrics, not weak-label AUC.
