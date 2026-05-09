-- Selectable URLs picker — store the explicit URL allowlist the user
-- ticked on the new-audit form. The runner prefers this list over
-- shard_urls so audits run exactly the URLs the user picked.
--
-- Nullable for back-compat: legacy rows have NULL and continue to fall
-- back to shard_urls (or the sitemap-then-crawl path if both are NULL).

alter table public.audits
  add column if not exists target_urls text[];

comment on column public.audits.target_urls is
  'Explicit per-page URL allowlist chosen on the new-audit form. Takes precedence over shard_urls when set.';
