# Supabase MCP (Cursor)

This cloud agent run does **not** have Supabase MCP attached. Configure it in Cursor Desktop against the `aviata` repo.

## 1. Add server (already in repo)

[`.cursor/mcp.json`](../.cursor/mcp.json) points at the hosted Supabase MCP:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?features=database,docs,development,debugging,storage,functions"
    }
  }
}
```

Optional query params:

| Param | Effect |
|-------|--------|
| `project_ref=YOUR_REF` | Scope to one project |
| `read_only=true` | Safer for prod-ish data |
| `features=…` | Enable tool groups (`storage` is off unless listed) |

One-click from dashboard: [Supabase → Connect → MCP](https://supabase.com/dashboard/project/_?showConnect=true&tab=mcp)

## 2. Authenticate

1. Open the project in **Cursor Desktop**
2. **Settings → Cursor Settings → Tools & MCP**
3. Enable **supabase** → complete browser OAuth
4. Restart Cursor if tools don’t appear

## 3. Apply ingest schema

After MCP is connected, ask the agent:

> Apply `supabase/migrations/20260802_ingest.sql` with Supabase MCP

That creates:

- `ingest_runs`, `media_objects`, `listed_empty_legs`, `training_features`
- Storage buckets: `ingest-raw`, `ingest-processed`, `model-artifacts`

## 4. Env for the Next app

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-only ingest uploads
```
