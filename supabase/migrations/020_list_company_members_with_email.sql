-- Roster with emails for org members (auth.users is not readable from the client).
create or replace function public.list_company_members_with_email(p_company_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.user_id,
    au.email::text,
    cm.role::text,
    cm.created_at
  from public.company_members cm
  inner join auth.users au on au.id = cm.user_id
  where cm.company_id = p_company_id
    and exists (
      select 1
      from public.company_members me
      where me.company_id = p_company_id
        and me.user_id = auth.uid()
    );
$$;

grant execute on function public.list_company_members_with_email(uuid) to authenticated;
