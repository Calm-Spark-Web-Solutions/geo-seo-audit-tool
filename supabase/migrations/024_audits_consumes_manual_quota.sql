-- Manual run quota: only audits that introduce at least one new roster URL
-- count toward monthly scan limits (see lib/billing/audit-quota.ts).
alter table public.audits
  add column if not exists consumes_manual_quota boolean not null default true;

comment on column public.audits.consumes_manual_quota is
  'When false, this audit does not count against monthly manual scan quota (tracked-page rescans).';
