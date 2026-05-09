-- Per-page opt-out from audit-level SEO/GEO/overall averages (e.g. password gates, staging).
alter table public.audit_pages
  add column if not exists exclude_from_audit_score boolean not null default false;

comment on column public.audit_pages.exclude_from_audit_score is
  'When true, this URL is omitted from parent audit SEO/GEO/overall score averages.';
