-- Fix: "new row violates row-level security policy for table 'companies'"
--
-- Two contributing causes:
--   1. INSERT ... RETURNING evaluates the SELECT USING policy on the new
--      row. The previous SELECT policy required `is_company_member(id)`,
--      which depends on the AFTER-INSERT trigger having already added the
--      owner to `company_members`. Any failure or ordering hiccup there
--      surfaces as the misleading "new row violates RLS" error.
--   2. The trigger that backfills company_members runs as SECURITY DEFINER,
--      but does not explicitly disable row_security; if the function owner
--      ever loses BYPASSRLS, the trigger's INSERT into company_members
--      itself silently fails the with-check.
--
-- Fix: include `user_id = auth.uid()` in the companies SELECT predicate so
-- the creator can always read their freshly-inserted row, and force the
-- trigger to disable row_security inside the function.

-- ---------------------------------------------------------------------------
-- 1. Companies INSERT + SELECT policies (idempotent recreate)
-- ---------------------------------------------------------------------------

drop policy if exists "Authenticated users can create companies" on public.companies;
drop policy if exists "Members can select their companies" on public.companies;

create policy "Authenticated users can create companies"
  on public.companies for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
  );

create policy "Members can select their companies"
  on public.companies for select
  using (
    user_id = auth.uid()
    or public.is_company_member(id)
  );

-- ---------------------------------------------------------------------------
-- 2. Harden the company-created trigger so the membership backfill always
--    bypasses RLS even if the function owner does not have BYPASSRLS.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.company_members (company_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

-- Ensure the trigger is wired to the hardened function.
drop trigger if exists on_company_created on public.companies;
create trigger on_company_created
  after insert on public.companies
  for each row execute function public.handle_new_company();
