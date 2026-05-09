-- Per-community manual verification checklist (JSON map of key -> status/notes).
alter table public.communities
  add column if not exists manual_check_results jsonb;

comment on column public.communities.manual_check_results is
  'User-recorded SEO/GEO verification items keyed by stable manual_key (see COMMUNITY_MANUAL_ITEMS).';

-- Site-wide probes (robots.txt, sitemap hint) computed once per audit run.
alter table public.audits
  add column if not exists site_wide_checks jsonb;

comment on column public.audits.site_wide_checks is
  'AuditCheck[] JSON from origin-level probes (robots, sitemap discovery).';
