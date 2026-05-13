-- Tiered audit billing model: page-roster tracking + monthly new-page caps.
--
-- - community_page_roster: source of truth for "what URLs are tracked under
--   a community". A row gets inserted the first time a URL appears in a
--   successful audit_pages insert (see lib/audit/run.ts). Rescans of an
--   existing roster URL are always free.
-- - subscriptions.plan_limits jsonb: per-subscription override hook for
--   community count / page roster cap / monthly new-page cap. NULL = use
--   defaults from lib/billing/plan-limits.ts for the plan slug.

create table if not exists public.community_page_roster (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities on delete cascade,
  url             text not null,
  first_seen_at   timestamptz not null default now(),
  -- Audit row that first introduced this URL. Useful for audit trails and
  -- so deleting a single audit does not orphan roster rows (set null).
  first_audit_id  uuid references public.audits on delete set null,
  constraint community_page_roster_unique_url unique (community_id, url)
);

create index if not exists community_page_roster_community_id_idx
  on public.community_page_roster (community_id);

create index if not exists community_page_roster_first_seen_at_idx
  on public.community_page_roster (community_id, first_seen_at);

alter table public.community_page_roster enable row level security;

-- Visibility / mutation policies follow community membership, identical
-- to how audit_pages access is scoped in migration 002.
create policy "Members can select community_page_roster"
  on public.community_page_roster for select
  using (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = community_page_roster.community_id
        and m.user_id = auth.uid()
    )
  );

create policy "Members can insert community_page_roster"
  on public.community_page_roster for insert
  with check (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = community_page_roster.community_id
        and m.user_id = auth.uid()
    )
  );

create policy "Members can update community_page_roster"
  on public.community_page_roster for update
  using (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = community_page_roster.community_id
        and m.user_id = auth.uid()
    )
  );

create policy "Members can delete community_page_roster"
  on public.community_page_roster for delete
  using (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = community_page_roster.community_id
        and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: seed the roster with URLs already scored so existing customers
-- aren't suddenly told "all of your URLs are new".
-- ---------------------------------------------------------------------------
insert into public.community_page_roster (community_id, url, first_seen_at, first_audit_id)
select distinct on (a.community_id, ap.url)
  a.community_id,
  ap.url,
  min(ap.created_at) over (partition by a.community_id, ap.url) as first_seen_at,
  first_value(ap.audit_id) over (
    partition by a.community_id, ap.url
    order by ap.created_at asc
  ) as first_audit_id
from public.audit_pages ap
join public.audits a on a.id = ap.audit_id
on conflict (community_id, url) do nothing;

-- ---------------------------------------------------------------------------
-- subscriptions.plan_limits: optional per-subscription override jsonb.
-- Shape matches PlanLimits in lib/billing/plan-limits.ts.
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists plan_limits jsonb;

comment on column public.subscriptions.plan_limits is
  'Optional override for billing caps (community count, page roster cap, monthly new-page cap). NULL = use lib/billing/plan-limits.ts defaults for the plan slug.';
