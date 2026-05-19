-- Persist per-URL HTML fetch failures for partial crawls (support + UI).
alter table public.audits
  add column if not exists fetch_failures jsonb;

comment on column public.audits.fetch_failures is
  'Array of {url, reason} for planned URLs whose HTML fetch failed during the run.';
