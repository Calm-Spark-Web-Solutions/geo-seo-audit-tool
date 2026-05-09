-- "Latest complete audit per community" is the hottest read on the
-- dashboard / company detail / community detail pages. Without this index
-- Postgres falls back to a sequential scan + sort once `audits` grows past
-- a few thousand rows, which directly translates to slower page renders.
--
-- The composite (community_id, status, created_at desc) lets the planner
-- jump straight to the relevant rows for both:
--   - "all audits for community X ordered by created_at desc"
--   - "most recent complete audit for community X"
--
-- Cite: app/(dashboard)/companies/[id]/page.tsx around the
--       "latest_complete_audit" reduce, and the community detail history
--       list rendered by AuditTrend / audit history sections.

create index if not exists idx_audits_community_status_created
  on public.audits (community_id, status, created_at desc);
