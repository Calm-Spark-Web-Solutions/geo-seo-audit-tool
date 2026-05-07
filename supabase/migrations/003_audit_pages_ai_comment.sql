-- Per-page AI narrative (Anthropic), alongside tool-based scores in jsonb columns.
alter table public.audit_pages
  add column if not exists ai_comment text;

comment on column public.audit_pages.ai_comment is
  'Short AI-generated commentary for stakeholders; optional when API key absent.';
