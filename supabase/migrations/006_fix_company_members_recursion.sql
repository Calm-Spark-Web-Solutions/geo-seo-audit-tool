-- Fix: "infinite recursion detected in policy for relation \"company_members\""
--
-- The original policies on public.company_members reference the same table in
-- their `using`/`with check` predicates (e.g. an EXISTS over company_members).
-- Postgres re-evaluates RLS when the predicate touches the same table, which
-- causes infinite recursion.
--
-- Fix: route the membership lookup through SECURITY DEFINER helper functions
-- that bypass RLS, then rewrite the company_members policies to use them.

-- ---------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER bypasses RLS on the lookup itself)
-- ---------------------------------------------------------------------------

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = p_company_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = p_company_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = p_company_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_admin(uuid) to authenticated;
grant execute on function public.is_company_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Replace recursive policies on company_members
-- ---------------------------------------------------------------------------

drop policy if exists "Members can select fellow members" on public.company_members;
drop policy if exists "Owners and admins can manage memberships" on public.company_members;
drop policy if exists "Owners and admins can update memberships" on public.company_members;
drop policy if exists "Owners and admins can remove memberships" on public.company_members;

create policy "Members can select fellow members"
  on public.company_members for select
  using (
    user_id = auth.uid()
    or public.is_company_member(company_id)
  );

create policy "Owners and admins can insert memberships"
  on public.company_members for insert
  with check (
    public.is_company_admin(company_id)
  );

create policy "Owners and admins can update memberships"
  on public.company_members for update
  using (
    public.is_company_admin(company_id)
  )
  with check (
    public.is_company_admin(company_id)
  );

create policy "Owners and admins can delete memberships"
  on public.company_members for delete
  using (
    public.is_company_admin(company_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Rewrite dependent policies to use the helpers
-- (Avoids future recursion and keeps policy bodies short.)
-- ---------------------------------------------------------------------------

drop policy if exists "Members can select their companies" on public.companies;
drop policy if exists "Owners and admins can update their companies" on public.companies;
drop policy if exists "Owners can delete their companies" on public.companies;

create policy "Members can select their companies"
  on public.companies for select
  using (public.is_company_member(id));

create policy "Owners and admins can update their companies"
  on public.companies for update
  using (public.is_company_admin(id))
  with check (public.is_company_admin(id));

create policy "Owners can delete their companies"
  on public.companies for delete
  using (public.is_company_owner(id));

drop policy if exists "Members can select communities" on public.communities;
drop policy if exists "Members can insert communities" on public.communities;
drop policy if exists "Members can update communities" on public.communities;
drop policy if exists "Members can delete communities" on public.communities;

create policy "Members can select communities"
  on public.communities for select
  using (public.is_company_member(company_id));

create policy "Members can insert communities"
  on public.communities for insert
  with check (public.is_company_member(company_id));

create policy "Members can update communities"
  on public.communities for update
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

create policy "Members can delete communities"
  on public.communities for delete
  using (public.is_company_member(company_id));

drop policy if exists "Owners and admins can select invites" on public.company_invites;
drop policy if exists "Owners and admins can create invites" on public.company_invites;
drop policy if exists "Owners and admins can update invites" on public.company_invites;
drop policy if exists "Owners and admins can delete invites" on public.company_invites;

create policy "Owners and admins can select invites"
  on public.company_invites for select
  using (public.is_company_admin(company_id));

create policy "Owners and admins can create invites"
  on public.company_invites for insert
  with check (
    invited_by = auth.uid()
    and public.is_company_admin(company_id)
  );

create policy "Owners and admins can update invites"
  on public.company_invites for update
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

create policy "Owners and admins can delete invites"
  on public.company_invites for delete
  using (public.is_company_admin(company_id));
