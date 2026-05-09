-- Chrome UX Report (field / origin-level) summary as AuditCheck JSON.
alter table public.audits
  add column if not exists crux_field_checks jsonb;

comment on column public.audits.crux_field_checks is
  'AuditCheck[] from CrUX Records API (origin-level p75 cohort metrics).';

-- Simhash cohort: near-duplicate page pairs detected within this audit batch.
alter table public.audits
  add column if not exists near_duplicate_checks jsonb;

comment on column public.audits.near_duplicate_checks is
  'AuditCheck[] from within-audit textual near-duplicate heuristic (batch scope).';
