-- Phase 6: live progress denominator. Polling UI uses pages_crawled / progress_total.
alter table public.audits
  add column if not exists progress_total int;

comment on column public.audits.progress_total is
  'Number of URLs the runner intends to score (set after URL discovery).';
