-- Audit category selection — let users target specific sitemap shards
-- (Pages, Posts, Categories, …) and configure how many URLs to crawl,
-- replacing the hard-coded 10-page limit baked into the runner.
--
-- Both columns are nullable for back-compat: pre-existing audit rows
-- continue to render unchanged and the runner falls back to the legacy
-- 10-page sitemap-then-crawl path when no selection was persisted.

alter table public.audits
  add column if not exists max_pages  int,
  add column if not exists shard_urls text[];

comment on column public.audits.max_pages is
  'User-selected URL cap for this run (1..1000). NULL = legacy default.';
comment on column public.audits.shard_urls is
  'Selected sitemap shard URLs to scope the crawl. NULL/empty = legacy fallback.';
