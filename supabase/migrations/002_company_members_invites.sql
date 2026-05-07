-- InyoCare SEO & GEO Audit Tool — multi-org membership + invites
-- Pivots access from `companies.user_id` to `company_members` so a single user
-- can belong to multiple companies. Existing `companies.user_id` is preserved
-- as the creator/primary contact.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.company_members (
  company_id  uuid not null references public.companies on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_id_idx on public.company_members (user_id);

create table public.company_invites (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies on delete cascade,
  email        text not null,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  token_hash   text not null unique,
  invited_by   uuid not null references auth.users on delete cascade,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index company_invites_company_id_idx on public.company_invites (company_id);
create index company_invites_email_idx on public.company_invites (lower(email));

-- ---------------------------------------------------------------------------
-- 2. Backfill memberships for existing companies, then add owner trigger
-- ---------------------------------------------------------------------------

insert into public.company_members (company_id, user_id, role)
select id, user_id, 'owner'
from public.companies
on conflict do nothing;

create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_members (company_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_company_created
  after insert on public.companies
  for each row execute function public.handle_new_company();

-- ---------------------------------------------------------------------------
-- 3. Re-pivot RLS: membership-based access
-- ---------------------------------------------------------------------------

alter table public.company_members enable row level security;
alter table public.company_invites enable row level security;

-- Drop legacy single-owner policies on companies and replace with membership-based.
drop policy if exists "Users can select own companies" on public.companies;
drop policy if exists "Users can insert own companies" on public.companies;
drop policy if exists "Users can update own companies" on public.companies;
drop policy if exists "Users can delete own companies" on public.companies;

create policy "Members can select their companies"
  on public.companies for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = companies.id and m.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create companies"
  on public.companies for insert
  with check (auth.uid() = user_id);

create policy "Owners and admins can update their companies"
  on public.companies for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin')
    )
  );

create policy "Owners can delete their companies"
  on public.companies for delete
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = companies.id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- Communities: any member of the company can read/write.
drop policy if exists "Users can select communities of own companies" on public.communities;
drop policy if exists "Users can insert communities of own companies" on public.communities;
drop policy if exists "Users can update communities of own companies" on public.communities;
drop policy if exists "Users can delete communities of own companies" on public.communities;

create policy "Members can select communities"
  on public.communities for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = communities.company_id and m.user_id = auth.uid()
    )
  );

create policy "Members can insert communities"
  on public.communities for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = communities.company_id and m.user_id = auth.uid()
    )
  );

create policy "Members can update communities"
  on public.communities for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = communities.company_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = communities.company_id and m.user_id = auth.uid()
    )
  );

create policy "Members can delete communities"
  on public.communities for delete
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = communities.company_id and m.user_id = auth.uid()
    )
  );

-- Audits: via community -> company membership.
drop policy if exists "Users can select audits of own communities" on public.audits;
drop policy if exists "Users can insert audits of own communities" on public.audits;
drop policy if exists "Users can update audits of own communities" on public.audits;
drop policy if exists "Users can delete audits of own communities" on public.audits;

create policy "Members can select audits"
  on public.audits for select
  using (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = audits.community_id and m.user_id = auth.uid()
    )
  );

create policy "Members can insert audits"
  on public.audits for insert
  with check (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = audits.community_id and m.user_id = auth.uid()
    )
  );

create policy "Members can update audits"
  on public.audits for update
  using (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = audits.community_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = audits.community_id and m.user_id = auth.uid()
    )
  );

create policy "Members can delete audits"
  on public.audits for delete
  using (
    exists (
      select 1
      from public.communities co
      join public.company_members m on m.company_id = co.company_id
      where co.id = audits.community_id and m.user_id = auth.uid()
    )
  );

-- Audit pages: via audit -> community -> company membership.
drop policy if exists "Users can select audit_pages of own audits" on public.audit_pages;
drop policy if exists "Users can insert audit_pages of own audits" on public.audit_pages;
drop policy if exists "Users can update audit_pages of own audits" on public.audit_pages;
drop policy if exists "Users can delete audit_pages of own audits" on public.audit_pages;

create policy "Members can select audit_pages"
  on public.audit_pages for select
  using (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where a.id = audit_pages.audit_id and m.user_id = auth.uid()
    )
  );

create policy "Members can insert audit_pages"
  on public.audit_pages for insert
  with check (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where a.id = audit_pages.audit_id and m.user_id = auth.uid()
    )
  );

create policy "Members can update audit_pages"
  on public.audit_pages for update
  using (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where a.id = audit_pages.audit_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where a.id = audit_pages.audit_id and m.user_id = auth.uid()
    )
  );

create policy "Members can delete audit_pages"
  on public.audit_pages for delete
  using (
    exists (
      select 1
      from public.audits a
      join public.communities co on co.id = a.community_id
      join public.company_members m on m.company_id = co.company_id
      where a.id = audit_pages.audit_id and m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. RLS for the new membership / invite tables
-- ---------------------------------------------------------------------------

-- Members can see their own row plus rows for any company they belong to.
create policy "Members can select fellow members"
  on public.company_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.company_members me
      where me.company_id = company_members.company_id and me.user_id = auth.uid()
    )
  );

create policy "Owners and admins can manage memberships"
  on public.company_members for insert
  with check (
    exists (
      select 1 from public.company_members me
      where me.company_id = company_members.company_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

create policy "Owners and admins can update memberships"
  on public.company_members for update
  using (
    exists (
      select 1 from public.company_members me
      where me.company_id = company_members.company_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

create policy "Owners and admins can remove memberships"
  on public.company_members for delete
  using (
    exists (
      select 1 from public.company_members me
      where me.company_id = company_members.company_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

-- Invites: visible / mutable only to owners and admins of the company.
-- (Acceptance is performed by a security-definer RPC below, so invitees
-- never need direct row access.)
create policy "Owners and admins can select invites"
  on public.company_invites for select
  using (
    exists (
      select 1 from public.company_members me
      where me.company_id = company_invites.company_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

create policy "Owners and admins can create invites"
  on public.company_invites for insert
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.company_members me
      where me.company_id = company_invites.company_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

create policy "Owners and admins can update invites"
  on public.company_invites for update
  using (
    exists (
      select 1 from public.company_members me
      where me.company_id = company_invites.company_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

create policy "Owners and admins can delete invites"
  on public.company_invites for delete
  using (
    exists (
      select 1 from public.company_members me
      where me.company_id = company_invites.company_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Accept invite RPC (security definer)
-- ---------------------------------------------------------------------------

create or replace function public.accept_company_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.company_invites%rowtype;
  v_user_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();

  select * into v_invite
  from public.company_invites
  where token_hash = p_token_hash
  limit 1;

  if v_invite.id is null then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'Invite already accepted' using errcode = '22023';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'Invite expired' using errcode = '22023';
  end if;

  if lower(v_invite.email) <> lower(v_user_email) then
    raise exception 'Invite is for a different email address' using errcode = '42501';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (v_invite.company_id, auth.uid(), v_invite.role)
  on conflict (company_id, user_id) do update set role = excluded.role;

  update public.company_invites
  set accepted_at = now()
  where id = v_invite.id;

  return v_invite.company_id;
end;
$$;

grant execute on function public.accept_company_invite(text) to authenticated;
