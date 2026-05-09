-- Phase 9: track which audit engine produced a given run.
--
-- engine_version 1 = original stub scorer (5 SEO + 5 GEO heuristics, optional
-- Anthropic free-text comment).
-- engine_version 2 = layered engine (expanded deterministic checks +
-- PageSpeed Insights + Anthropic structured subscores via tool-use).
--
-- Older rows default to 1 so existing audit_pages JSONB stays interpretable;
-- new rows get 2 from runAudit.

alter table public.audits
  add column if not exists engine_version smallint not null default 1;

comment on column public.audits.engine_version is
  'Audit engine schema version. 1 = legacy stub, 2 = layered (deterministic + PSI + Anthropic tool-use).';
