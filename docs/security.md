# Security: Supabase, RLS, and secrets

This document is the **implementation companion** for Row Level Security (RLS) and operational hardening. Apply it per environment (local, preview, production).

## 1. Remote inventory (Supabase Dashboard)

**Migrations**

- Repo migrations live in [`supabase/migrations/`](../supabase/migrations/). After linking the CLI (`supabase link`), compare applied history to this folder:
  - `supabase migration list` (remote vs local), or
  - Dashboard → Database → Migrations.

**Advisors**

- Dashboard → **Advisors** (or **Database** → **Linter**): resolve RLS, leaked password, extension, and security warnings before treating an environment as production-ready.

**RLS sanity**

- For each table under `public`, confirm **RLS is enabled** and policies match intent: tenant data must require `authenticated` + membership (see migrations `001`, `002`, `005`, `009`, `012`, `022`).
- **`anon`** should not receive broad `SELECT`/`INSERT` on tenant tables. Policies in this project target **`authenticated`** where applicable (see migration SQL `to authenticated` on grants).

**Storage**

- Bucket **`audit-reports`** must stay **private** (`public = false`). Policies are defined in [`005_audit_report_storage.sql`](../supabase/migrations/005_audit_report_storage.sql).
- Saved PDF object keys follow `audits/<audit_id>/...`; access is derived from `audits` → `communities` → `company_members`.

## 2. Cross-tenant verification (staging or disposable project)

Run with **two accounts**: User A (org owner) and User B (unrelated).

1. As **A**: create a company, community, and start a visibility scan; note `audit_id` and one `audit_page` id from the UI or SQL.
2. As **B** (signed in): in SQL Editor (role = authenticated as B) or via the app API with B’s session:
   - `select * from audits where id = '<A-audit-id>'` → **no rows** (RLS).
   - `update audits set status = 'failed' where id = '<A-audit-id>'` → **0 rows** affected.
   - Attempt to open `/visibility-scans/<A-audit-id>` in the browser → **404** / not found after RLS.
3. **Runner / cron** (no user cookie):
   - `POST /api/visibility-scans/<any-id>/run` without `x-audit-runner-token` → **403**.
   - `GET|POST /api/visibility-scans/cron-tick` without `Authorization: Bearer <CRON_SECRET>` and without valid runner header → **403**.
4. **Stripe**: `POST /api/stripe/webhook` with garbage body / missing `stripe-signature` → **400** (signature verification in [`app/api/stripe/webhook/route.ts`](../app/api/stripe/webhook/route.ts)).

**Server actions using the service role**

- [`cancel-action.ts`](../app/(dashboard)/visibility-scans/[id]/cancel-action.ts): updates `audits` with the **user-scoped** client first; only if a row is returned does it call `createServiceClient()` to cancel `audit_jobs`. If RLS blocks the update, the service role path never runs for that id.
- [`retry-runner-action.ts`](../app/(dashboard)/visibility-scans/[id]/retry-runner-action.ts): loads the audit with the **user-scoped** client; service role is used only for the `failed` → `pending` reset path after access is proven.

## 3. Service role and bypass paths

| Entry | Guard |
|--------|--------|
| [`app/api/visibility-scans/[id]/run/route.ts`](../app/api/visibility-scans/[id]/run/route.ts) | `AUDIT_RUNNER_SECRET` / `x-audit-runner-token` |
| [`app/api/visibility-scans/cron-tick/route.ts`](../app/api/visibility-scans/cron-tick/route.ts) | `CRON_SECRET` Bearer or same runner header |
| [`app/api/stripe/webhook/route.ts`](../app/api/stripe/webhook/route.ts) | `STRIPE_WEBHOOK_SECRET` + Stripe signature |

[`lib/supabase/service.ts`](../lib/supabase/service.ts) bypasses RLS — **never** import it from client bundles.

## 4. `audit_jobs` queue invariant

- **`authenticated`** has **SELECT** and **INSERT** (enqueue) policies; there are **no** broad **UPDATE**/**DELETE** policies for members on `audit_jobs`. Queue state changes for running work use **`service_role`** (runner / cancel path after user proved access).
- Do not add a generic `UPDATE` policy for `authenticated` without a design review; it would let clients tamper with leases.

## 5. `consume_rate_limit` RPC

- Defined in [`009_audit_ops.sql`](../supabase/migrations/009_audit_ops.sql); granted to **`authenticated`** and **`service_role`**.
- App code calls it only from **server** paths via [`lib/ratelimit.ts`](../lib/ratelimit.ts) with **namespaced keys** (e.g. `audit:cancel:<user_id>`). Do not call it from the browser with user-supplied keys.

## 6. Secrets and preview deployments

- **`SUPABASE_SERVICE_ROLE_KEY`**, **`AUDIT_RUNNER_SECRET`**, **`CRON_SECRET`**, **`STRIPE_WEBHOOK_SECRET`**, **`STRIPE_SECRET_KEY`**: server-only; **never** prefix with `NEXT_PUBLIC_`.
- **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** are expected to be public; they still rely on RLS.
- **Preview** branches: prefer a **non-production** Supabase project or strictly scoped secrets. See [README.md](../README.md) deployment notes on preview risk.

## 7. Optional operational hardening

- **CSP reports**: [`app/api/csp-report/route.ts`](../app/api/csp-report/route.ts) is intentionally unauthenticated; if abused, add edge rate limits or a signed `report-to` URL.
- **Auth**: enable email confirmation, MFA for admins, and auth rate limits in Supabase **Authentication** settings.
