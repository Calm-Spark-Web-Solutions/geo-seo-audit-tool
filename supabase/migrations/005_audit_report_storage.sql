-- Phase 7: PDF report export + Supabase Storage.
-- Adds columns to track the most-recently saved PDF for an audit, plus a
-- private storage bucket and RLS so only members of the owning company can
-- read/write the PDF objects.

alter table public.audits
  add column if not exists report_pdf_path text,
  add column if not exists report_generated_at timestamptz;

comment on column public.audits.report_pdf_path is
  'Storage object key (in audit-reports bucket) for the latest saved PDF.';
comment on column public.audits.report_generated_at is
  'Timestamp of the latest saved PDF.';

-- ---------------------------------------------------------------------------
-- Storage bucket: audit-reports (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('audit-reports', 'audit-reports', false)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- RLS policies on storage.objects for audit-reports
-- Object key layout: audits/<audit_id>/<timestamp>.pdf
-- A user has access iff they are a member of the company that owns the
-- community that owns the audit referenced in the second path segment.
-- ---------------------------------------------------------------------------

drop policy if exists "Members can select audit reports" on storage.objects;
drop policy if exists "Members can insert audit reports" on storage.objects;
drop policy if exists "Members can update audit reports" on storage.objects;
drop policy if exists "Members can delete audit reports" on storage.objects;

create policy "Members can select audit reports"
  on storage.objects for select
  using (
    bucket_id = 'audit-reports'
    and exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where m.user_id = auth.uid()
        and storage.objects.name like 'audits/' || a.id::text || '/%'
    )
  );

create policy "Members can insert audit reports"
  on storage.objects for insert
  with check (
    bucket_id = 'audit-reports'
    and exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where m.user_id = auth.uid()
        and storage.objects.name like 'audits/' || a.id::text || '/%'
    )
  );

create policy "Members can update audit reports"
  on storage.objects for update
  using (
    bucket_id = 'audit-reports'
    and exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where m.user_id = auth.uid()
        and storage.objects.name like 'audits/' || a.id::text || '/%'
    )
  )
  with check (
    bucket_id = 'audit-reports'
    and exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where m.user_id = auth.uid()
        and storage.objects.name like 'audits/' || a.id::text || '/%'
    )
  );

create policy "Members can delete audit reports"
  on storage.objects for delete
  using (
    bucket_id = 'audit-reports'
    and exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where m.user_id = auth.uid()
        and storage.objects.name like 'audits/' || a.id::text || '/%'
    )
  );
