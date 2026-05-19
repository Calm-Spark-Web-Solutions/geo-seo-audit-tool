-- Company-level Google OAuth, per-community GSC/GA4 mapping, daily metrics snapshots.

create table if not exists public.company_google_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  refresh_token_encrypted text not null,
  scopes text[] not null default '{}',
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  last_error text,
  google_account_email text,
  unique (company_id)
);

comment on table public.company_google_connections is
  'One Google OAuth connection per company; refresh token stored encrypted server-side.';

create table if not exists public.community_google_properties (
  community_id uuid primary key references public.communities (id) on delete cascade,
  gsc_site_url text,
  ga4_property_id text,
  updated_at timestamptz not null default now()
);

comment on table public.community_google_properties is
  'Maps a community to GSC site URL (e.g. sc-domain:example.com) and GA4 property (properties/123).';

create table if not exists public.community_google_metrics_snapshots (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  snapshot_date date not null,
  gsc_clicks_28d bigint,
  gsc_impressions_28d bigint,
  ga4_sessions_28d bigint,
  ga4_active_users_28d bigint,
  source text not null check (source in ('audit', 'daily_sync')),
  audit_id uuid references public.audits (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (community_id, snapshot_date)
);

create index if not exists community_google_metrics_snapshots_community_date_idx
  on public.community_google_metrics_snapshots (community_id, snapshot_date desc);

comment on table public.community_google_metrics_snapshots is
  'Append-only daily 28-day rollup metrics for trend charts (audit or daily_sync).';

alter table public.audits
  add column if not exists google_field_checks jsonb,
  add column if not exists google_metrics jsonb;

comment on column public.audits.google_field_checks is
  'Automated GSC/GA4 API checks (AuditCheck[] JSON), parallel to crux_field_checks.';

comment on column public.audits.google_metrics is
  'Point-in-time 28-day GSC/GA4 totals captured when the scan completed.';

-- RLS
alter table public.company_google_connections enable row level security;
alter table public.community_google_properties enable row level security;
alter table public.community_google_metrics_snapshots enable row level security;

create policy "Company members can read google connections"
  on public.company_google_connections for select
  using (public.is_company_member(company_id));

create policy "Company admins can manage google connections"
  on public.company_google_connections for all
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

create policy "Company members can read community google properties"
  on public.community_google_properties for select
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_id
        and public.is_company_member(c.company_id)
    )
  );

create policy "Company admins can manage community google properties"
  on public.community_google_properties for all
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

create policy "Company members can read google metrics snapshots"
  on public.community_google_metrics_snapshots for select
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_id
        and public.is_company_member(c.company_id)
    )
  );

-- Inserts/updates for snapshots come from the audit runner (service role).
