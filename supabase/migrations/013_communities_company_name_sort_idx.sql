-- Paginated community lists scoped by company are ordered by name.
-- Composite index avoids sorting large result sets after filtering by company_id.

create index if not exists communities_company_id_name_idx
  on public.communities (company_id asc, name asc);
