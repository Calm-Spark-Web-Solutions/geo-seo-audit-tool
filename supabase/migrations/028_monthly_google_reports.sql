-- Monthly Google report idempotency + recipient lookup for cron emails.

create table if not exists public.company_monthly_google_reports (
  company_id uuid not null references public.companies (id) on delete cascade,
  report_month date not null,
  sent_at timestamptz not null default now(),
  recipient_count int not null default 0,
  communities_synced int not null default 0,
  scans_queued int not null default 0,
  primary key (company_id, report_month)
);

comment on table public.company_monthly_google_reports is
  'One row per organization per UTC month after a successful monthly Google digest email.';

create index if not exists company_monthly_google_reports_month_idx
  on public.company_monthly_google_reports (report_month desc);

alter table public.company_monthly_google_reports enable row level security;

-- Cron uses service role; no client policies in v1.

create or replace function public.list_company_monthly_report_recipients(p_company_id uuid)
returns table (email text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(trim(e))::text as email
  from (
    select au.email::text as e
    from public.company_members cm
    inner join auth.users au on au.id = cm.user_id
    where cm.company_id = p_company_id
      and cm.role in ('owner', 'admin')
      and au.email is not null
    union all
    select c.contact_email as e
    from public.companies c
    where c.id = p_company_id
      and c.contact_email is not null
      and trim(c.contact_email) <> ''
  ) s
  where e is not null and trim(e) <> '' and position('@' in e) > 0;
$$;

revoke all on function public.list_company_monthly_report_recipients(uuid) from public;
grant execute on function public.list_company_monthly_report_recipients(uuid) to service_role;
