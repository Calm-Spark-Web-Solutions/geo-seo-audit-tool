-- Make audit_jobs INSERT policy explicit (audits + communities + company_members).
-- Semantics match migration 012: only members who can see the audit may enqueue.
-- The prior EXISTS (select 1 from audits a where a.id = audit_jobs.audit_id) was
-- already safe under RLS; this version is easier to audit in code review.

drop policy if exists "Members can enqueue jobs for accessible audits"
  on public.audit_jobs;

create policy "Members can enqueue jobs for accessible audits"
  on public.audit_jobs for insert
  with check (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where a.id = audit_jobs.audit_id
        and m.user_id = auth.uid()
    )
  );
