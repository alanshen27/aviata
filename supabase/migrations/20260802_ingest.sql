-- REPOSITION ingest schema: SQL tables + storage buckets for OSINT / listings.
-- Apply via Supabase MCP (apply_migration) or: supabase db push

create extension if not exists "pgcrypto";

create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.media_objects (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_path text not null,
  content_type text,
  bytes bigint,
  checksum text,
  source text,
  ingest_run_id uuid references public.ingest_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

create table if not exists public.listed_empty_legs (
  id text primary key,
  source text not null,
  origin_iata text,
  destination_iata text,
  departure_date date,
  aircraft text,
  category text,
  price_text text,
  url text,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create table if not exists public.training_features (
  id bigserial primary key,
  icao24 text,
  origin_icao text,
  dest_icao text,
  departed_at timestamptz,
  label int not null check (label in (0, 1)),
  label_source text not null default 'weak_geometry',
  features jsonb not null,
  ingest_run_id uuid references public.ingest_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists training_features_label_idx on public.training_features (label);
create index if not exists listed_empty_legs_route_idx
  on public.listed_empty_legs (origin_iata, destination_iata, departure_date);

-- Storage buckets (also creatable in Dashboard → Storage)
insert into storage.buckets (id, name, public)
values
  ('ingest-raw', 'ingest-raw', false),
  ('ingest-processed', 'ingest-processed', false),
  ('model-artifacts', 'model-artifacts', false)
on conflict (id) do nothing;
