-- InyoCare SEO & GEO Audit Tool — initial schema
-- Run with Supabase CLI: npx supabase db push (or apply in SQL editor)

-- Companies (e.g. "Compass Senior Living")
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  name          text not null,
  logo_url      text,
  contact_name  text,
  contact_email text,
  notes         text,
  created_at    timestamptz default now()
);

create index companies_user_id_idx on public.companies (user_id);

-- Individual communities / websites
create table public.communities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies on delete cascade not null,
  name         text not null,
  website_url  text not null,
  created_at   timestamptz default now()
);

create index communities_company_id_idx on public.communities (company_id);

-- Audit runs
create table public.audits (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid references public.communities on delete cascade not null,
  status         text default 'pending' not null,
  score          int,
  seo_score      int,
  geo_score      int,
  pages_crawled  int default 0 not null,
  created_at     timestamptz default now()
);

create index audits_community_id_idx on public.audits (community_id);

-- Per-page results within an audit
create table public.audit_pages (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid references public.audits on delete cascade not null,
  url           text not null,
  score         int,
  seo_results     jsonb,
  geo_results     jsonb,
  fixes           jsonb,
  manual_notes    text,
  created_at      timestamptz default now()
);

create index audit_pages_audit_id_idx on public.audit_pages (audit_id);

-- Stripe subscriptions (schema parity; Stripe integration later)
create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users not null,
  stripe_customer_id   text,
  stripe_sub_id        text,
  plan                 text,
  status               text,
  created_at           timestamptz default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

-- Row Level Security
alter table public.companies enable row level security;
alter table public.communities enable row level security;
alter table public.audits enable row level security;
alter table public.audit_pages enable row level security;
alter table public.subscriptions enable row level security;

-- Companies: owner only
create policy "Users can select own companies"
  on public.companies for select
  using (auth.uid() = user_id);

create policy "Users can insert own companies"
  on public.companies for insert
  with check (auth.uid() = user_id);

create policy "Users can update own companies"
  on public.companies for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own companies"
  on public.companies for delete
  using (auth.uid() = user_id);

-- Communities: via owning company
create policy "Users can select communities of own companies"
  on public.communities for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = communities.company_id and c.user_id = auth.uid()
    )
  );

create policy "Users can insert communities of own companies"
  on public.communities for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = communities.company_id and c.user_id = auth.uid()
    )
  );

create policy "Users can update communities of own companies"
  on public.communities for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = communities.company_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.companies c
      where c.id = communities.company_id and c.user_id = auth.uid()
    )
  );

create policy "Users can delete communities of own companies"
  on public.communities for delete
  using (
    exists (
      select 1 from public.companies c
      where c.id = communities.company_id and c.user_id = auth.uid()
    )
  );

-- Audits: via community -> company
create policy "Users can select audits of own communities"
  on public.audits for select
  using (
    exists (
      select 1
      from public.communities co
      join public.companies c on c.id = co.company_id
      where co.id = audits.community_id and c.user_id = auth.uid()
    )
  );

create policy "Users can insert audits of own communities"
  on public.audits for insert
  with check (
    exists (
      select 1
      from public.communities co
      join public.companies c on c.id = co.company_id
      where co.id = audits.community_id and c.user_id = auth.uid()
    )
  );

create policy "Users can update audits of own communities"
  on public.audits for update
  using (
    exists (
      select 1
      from public.communities co
      join public.companies c on c.id = co.company_id
      where co.id = audits.community_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.communities co
      join public.companies c on c.id = co.company_id
      where co.id = audits.community_id and c.user_id = auth.uid()
    )
  );

create policy "Users can delete audits of own communities"
  on public.audits for delete
  using (
    exists (
      select 1
      from public.communities co
      join public.companies c on c.id = co.company_id
      where co.id = audits.community_id and c.user_id = auth.uid()
    )
  );

-- Audit pages: via audit -> community -> company
create policy "Users can select audit_pages of own audits"
  on public.audit_pages for select
  using (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.companies c on c.id = co.company_id
      where a.id = audit_pages.audit_id and c.user_id = auth.uid()
    )
  );

create policy "Users can insert audit_pages of own audits"
  on public.audit_pages for insert
  with check (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.companies c on c.id = co.company_id
      where a.id = audit_pages.audit_id and c.user_id = auth.uid()
    )
  );

create policy "Users can update audit_pages of own audits"
  on public.audit_pages for update
  using (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.companies c on c.id = co.company_id
      where a.id = audit_pages.audit_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.companies c on c.id = co.company_id
      where a.id = audit_pages.audit_id and c.user_id = auth.uid()
    )
  );

create policy "Users can delete audit_pages of own audits"
  on public.audit_pages for delete
  using (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.companies c on c.id = co.company_id
      where a.id = audit_pages.audit_id and c.user_id = auth.uid()
    )
  );

-- Subscriptions: owner only
create policy "Users can select own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own subscriptions"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own subscriptions"
  on public.subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own subscriptions"
  on public.subscriptions for delete
  using (auth.uid() = user_id);
