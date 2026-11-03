# API keys & secrets (REPOSITION / aviata)

## Required to run on Render (today)

| Variable | Where | Required? | Notes |
|----------|--------|-----------|--------|
| `REDIS_URL` | Render Key Value | Auto | Wired in `render.yaml` via `fromService` — do **not** paste manually |
| `NEXT_PUBLIC_SUPABASE_URL` | [Supabase → Project Settings → API](https://supabase.com/dashboard/project/_/settings/api) | Yes* | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | Yes* | Public anon key (RLS must protect data) |
| `SUPABASE_SERVICE_ROLE_KEY` | same | Yes* | **Server-only** — ingest uploads, bypasses RLS |

\*Demo UI + scoring work without Supabase; needed for persistent ingest / storage.

Render itself: **no API key** to deploy a Blueprint from the Dashboard (GitHub OAuth).  
`RENDER_API_KEY` is only if you use the [Render API / Terraform](https://api-docs.render.com/) later.

## Optional (product features)

| Variable | When you need it |
|----------|------------------|
| `STRIPE_SECRET_KEY` | Charge Radar ($49) / Broker ($299) — currently placeholder in `/api/alerts` |
| `STRIPE_WEBHOOK_SECRET` | Confirm paid subscriptions |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client checkout |
| `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` | Authenticated OpenSky Network API (research license only) |
| Commercial ADS-B key (vendor-specific) | Sellable live feed — OpenSky free / ADSB.lol alone are not enough for commercial redistribution |
| `REPOSITION_USE_PYTHON_ML=1` | Force Python XGB/LSTM/Transformer on the server (needs Python + trained `ml/models/` on the instance) |
| `WORKER_CONCURRENCY` | BullMQ concurrency (default `2`) |

## Not needed for v1

- Avinode / FL3XX keys — industry listing APIs (later broker integrations)
- OpenAI / LLM keys — models are local XGB/LSTM/Transformer
- Notion / Slack — tooling only

## Supabase MCP (Cursor Desktop)

OAuth in **Settings → Tools & MCP → supabase** — no personal access token required for the hosted MCP URL in `.cursor/mcp.json`.
