-- Migration 009 created `public.audit_jobs` with RLS enabled and a SELECT
-- policy, but no INSERT policy. The user-cookie Supabase client used in the
-- start-audit server action calls `enqueueAudit`, which then errors with:
--
--   "new row violates row-level security policy for table audit_jobs"
--
-- The service role bypasses RLS so the runner / cron tick are unaffected.
-- This migration adds an INSERT policy that delegates to the audits RLS
-- chain via an EXISTS subquery: if the caller can see the audit row, they
-- can enqueue a job for it. That stays correct as the audits chain evolves
-- (company_members etc.).

drop policy if exists "Members can enqueue jobs for accessible audits"
  on public.audit_jobs;
create policy "Members can enqueue jobs for accessible audits"
  on public.audit_jobs for insert
  with check (
    exists (
      select 1
      from public.audits a
      where a.id = audit_jobs.audit_id
    )
  );
