-- Per-organization settings for the monthly Google digest + free visibility rescan.

create table if not exists public.company_monthly_report_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  enabled boolean not null default true,
  include_owner_emails boolean not null default true,
  include_admin_emails boolean not null default true,
  include_contact_email boolean not null default true,
  additional_recipients text[] not null default '{}',
  queue_monthly_scans boolean not null default true,
  sync_metrics_before_send boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.company_monthly_report_settings is
  'Controls monthly automatic GSC/GA4 digest email and free visibility rescans per organization.';

alter table public.company_monthly_report_settings enable row level security;

create policy "Company members can read monthly report settings"
  on public.company_monthly_report_settings for select
  using (public.is_company_member(company_id));

create policy "Company admins can manage monthly report settings"
  on public.company_monthly_report_settings for all
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Member emails by role for recipient resolution (cron uses service role).
create or replace function public.list_company_member_emails_by_role(
  p_company_id uuid,
  p_roles text[]
)
returns table (email text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(trim(au.email))::text as email
  from public.company_members cm
  inner join auth.users au on au.id = cm.user_id
  where cm.company_id = p_company_id
    and cm.role = any (p_roles)
    and au.email is not null
    and trim(au.email) <> ''
    and position('@' in au.email) > 0;
$$;

revoke all on function public.list_company_member_emails_by_role(uuid, text[]) from public;
grant execute on function public.list_company_member_emails_by_role(uuid, text[]) to service_role;
grant execute on function public.list_company_member_emails_by_role(uuid, text[]) to authenticated;
