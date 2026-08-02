# Deploy on Render (IaC)

Blueprint file: [`render.yaml`](../render.yaml)

## What it creates

| Resource | Name | Role |
|----------|------|------|
| Key Value (Redis) | `reposition-redis` | BullMQ for `/api/jobs` + worker |
| Web | `reposition-web` | Next.js (`npm start`) |
| Worker | `reposition-worker` | `npm run worker` |

## Deploy

1. Push this repo to GitHub (`alanshen27/aviata`).
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Select the repo; Render reads `render.yaml`.
4. When prompted, paste secrets from [API_KEYS.md](./API_KEYS.md) (`sync: false` vars).
5. Apply → wait for web + worker healthy (`/api/health`).

## Free-tier notes

- Free web services spin down after idle; first request may be slow.
- Free Redis / workers have limits — upgrade if jobs pile up.
- Python ML training stays offline (`npm run ml:train`); production defaults to the TS ensemble unless you bake models into the image and set `REPOSITION_USE_PYTHON_ML=1`.
