-- Allow company admins to upsert metrics snapshots from the UI refresh action
-- (audit runner continues to use service role).

create policy "Company admins can manage google metrics snapshots"
  on public.community_google_metrics_snapshots for all
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_id
        and public.is_company_admin(c.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.communities c
      where c.id = community_id
        and public.is_company_admin(c.company_id)
    )
  );
