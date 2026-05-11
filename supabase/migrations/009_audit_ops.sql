-- Phase 10: durable audit queue + per-org rate limit.
--
-- The audit runner used to be HTTP fire-and-forget — if Vercel killed the
-- function or the network blipped between startAudit and /api/visibility-scans/[id]/run,
-- the audit silently sat in `running` forever. This migration adds:
--
--   1. `audit_jobs` — the durable queue. One non-terminal row per audit
--      (unique partial index). The runner claims a job by setting
--      `lease_until = now() + 8 minutes`. A 1-minute Vercel Cron sweeps any
--      job whose lease has expired and either retries (attempts < max) or
--      marks the audit failed.
--
--   2. `rate_limits` + `consume_rate_limit(...)` — atomic counter so the
--      action layer can cap per-org audit starts (e.g. 10 per hour) before
--      we burn PSI / Anthropic quota.

-- =================== queue ===================

create table if not exists public.audit_jobs (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references public.audits(id) on delete cascade,
  status        text not null default 'queued', -- queued | running | completed | failed | cancelled
  attempts      int  not null default 0,
  max_attempts  int  not null default 3,
  lease_until   timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Idempotency: at most one queued/running job per audit at any time.
create unique index if not exists audit_jobs_one_active_per_audit
  on public.audit_jobs (audit_id)
  where status in ('queued', 'running');

-- Sweep helper: cheap to find expired-lease running jobs and queued jobs.
create index if not exists audit_jobs_sweep_idx
  on public.audit_jobs (status, lease_until);

create index if not exists audit_jobs_audit_id_idx
  on public.audit_jobs (audit_id);

alter table public.audit_jobs enable row level security;

-- The service role bypasses RLS, so the runner / cron tick can read+write
-- freely. End users only need to see the existence of jobs that belong to
-- audits they can already see via the existing audits RLS chain.
drop policy if exists "Members can read jobs for accessible audits"
  on public.audit_jobs;
create policy "Members can read jobs for accessible audits"
  on public.audit_jobs for select
  using (
    exists (
      select 1
      from public.audits a
      where a.id = audit_jobs.audit_id
    )
  );

-- =================== rate limits ===================

create table if not exists public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  count         int not null default 0,
  updated_at    timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies: all access goes through consume_rate_limit (security definer).

-- Atomically increment a counter inside a sliding window. Returns true when
-- the caller is within the cap, false when the cap is exhausted for this
-- window. Resets the window automatically when the previous window expired.
create or replace function public.consume_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamptz := now();
  v_row      public.rate_limits;
  v_expired  boolean;
begin
  insert into public.rate_limits (key, window_start, count, updated_at)
  values (p_key, v_now, 0, v_now)
  on conflict (key) do nothing;

  select * into v_row
  from public.rate_limits
  where key = p_key
  for update;

  v_expired := (v_now - v_row.window_start) >= make_interval(secs => p_window_seconds);

  if v_expired then
    update public.rate_limits
       set window_start = v_now,
           count        = 1,
           updated_at   = v_now
     where key = p_key;
    return true;
  end if;

  if v_row.count >= p_max then
    return false;
  end if;

  update public.rate_limits
     set count      = count + 1,
         updated_at = v_now
   where key = p_key;
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, int, int) from public;
grant execute on function public.consume_rate_limit(text, int, int)
  to authenticated, service_role;

comment on table public.audit_jobs is
  'Durable queue for audit runs. Phase 10 — survives Vercel kills via lease + cron reaper.';
comment on table public.rate_limits is
  'Sliding-window rate-limit counters. Use consume_rate_limit() for atomic checks.';
