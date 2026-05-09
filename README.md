# InyoCare SEO & GEO Audit Tool

A full-stack web application for InyoCare to run AI-powered SEO and GEO (Generative Engine Optimization) audits on senior living community websites. Supports multi-company, multi-community management with audit history, PDF reporting, and billing via Stripe.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage (PDF reports) |
| Realtime | Supabase Realtime (audit progress) |
| AI | Anthropic API (`claude-sonnet-4-20250514`) |
| Crawling | sitemap-parser + cheerio + axios |
| PDF Export | @react-pdf/renderer |
| Billing | Stripe + Stripe Webhooks |
| Hosting | Vercel |

---

## Project Structure

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── companies/
│   │   │   ├── page.tsx                  # List all companies
│   │   │   ├── new/page.tsx              # Create company
│   │   │   └── [id]/page.tsx             # Company detail + communities
│   │   ├── communities/
│   │   │   ├── [id]/page.tsx             # Community detail + audit history
│   │   │   └── [id]/new-audit/page.tsx   # Run new audit
│   │   └── audits/
│   │       ├── [id]/page.tsx             # Full audit report
│   │       └── [id]/export/page.tsx      # PDF export preview
│   ├── api/
│   │   ├── audit/
│   │   │   ├── start/route.ts            # Kick off audit job
│   │   │   ├── crawl/route.ts            # Crawl sitemap / pages
│   │   │   └── analyze/route.ts          # Run Anthropic analysis per page
│   │   ├── stripe/
│   │   │   └── webhook/route.ts          # Stripe webhook → subscriptions table
│   │   └── export/
│   │       └── pdf/route.ts              # Generate + upload PDF to Supabase Storage
│   └── layout.tsx
├── components/
│   ├── audit/
│   │   ├── AuditProgress.tsx             # Realtime progress bar
│   │   ├── AuditReport.tsx               # Full report display
│   │   ├── CheckItem.tsx                 # Pass/fail/warn row
│   │   ├── ScoreCard.tsx                 # Score + pill summary
│   │   └── FixList.tsx                   # Prioritized fixes
│   ├── companies/
│   │   ├── CompanyCard.tsx
│   │   └── CompanyForm.tsx
│   ├── communities/
│   │   ├── CommunityCard.tsx
│   │   └── CommunityForm.tsx
│   └── ui/                               # shadcn/ui components
├── lib/
│   ├── supabase/
│   │   ├── client.ts                     # Browser client
│   │   ├── server.ts                     # Server client (SSR)
│   │   └── middleware.ts                 # Auth middleware
│   ├── anthropic/
│   │   ├── excerpt.ts                    # HTML to plain excerpt for prompts
│   │   └── system-prompt.ts              # Cached rubric + voice + subscore anchors
│   ├── audit/
│   │   ├── run.ts                        # Audit orchestrator (crawl → score → persist)
│   │   └── diff.ts                       # Per-check delta vs. prior audit
│   ├── crawler/
│   │   ├── fetch.ts                      # Shared HTML fetch
│   │   ├── sitemap.ts                    # Fetch + parse sitemap.xml (same-origin)
│   │   └── crawl.ts                      # Fallback HTML crawler
│   ├── scoring/
│   │   ├── index.ts                      # Layered orchestrator (det + PSI + AI)
│   │   ├── deterministic.ts              # cheerio checks (10 SEO + 9 GEO keys)
│   │   ├── psi.ts                        # Google PageSpeed Insights wrapper
│   │   └── anthropic-scores.ts           # Anthropic tool-use: comment + 4 subscores
│   ├── billing/
│   │   ├── actions.ts                    # Checkout + Customer Portal (server actions)
│   │   ├── plans.ts                      # Tier marketing copy + Partner program label
│   │   └── price-map.ts                  # Env Price IDs ↔ plan slug for webhooks
│   ├── stripe/
│   │   └── server.ts                     # Lazy Stripe SDK (server-only)
│   └── pdf/
│       ├── report.tsx                    # React PDF document (per-page report)
│       └── render.tsx                    # Buffer renderer + RLS-aware payload loader
├── types/
│   └── index.ts                          # Shared TypeScript types
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql        # DB schema
│       ├── 002_company_members_invites.sql
│       ├── 003_audit_pages_ai_comment.sql
│       ├── 004_audits_progress.sql
│       ├── 005_audit_report_storage.sql  # PDF columns + audit-reports bucket + RLS
│       ├── 006_fix_company_members_recursion.sql
│       ├── 007_companies_insert_select_fix.sql
│       └── 008_audits_engine_version.sql # engine_version smallint (1 = stub, 2 = layered)
└── .env.local                            # Environment variables
```

### Audit engine layers

The Phase 9 engine layers three independent signal sources behind one orchestrator (`lib/scoring/index.ts → scoreAndAnalyzePage`). Each layer is optional; if a key is absent or a remote call fails, that layer simply contributes no checks and the audit still completes.

| Layer | Source | Bucket(s) | Required env |
|---|---|---|---|
| Deterministic | cheerio over fetched HTML | SEO + GEO | none |
| PageSpeed Insights | Google PSI v5 (mobile strategy) | SEO (`psi_seo`, `psi_best_practices`) + GEO (`psi_performance`, `psi_accessibility`) | `PSI_API_KEY` |
| Anthropic | One tool-use call returning `{ comment, scores }` | GEO (`ai_eeat`, `ai_content_depth`, `ai_scannability`, `ai_entity_clarity`) | `ANTHROPIC_API_KEY` |

Per-page AI calls reuse Anthropic's **ephemeral prompt cache** on the long static rubric in [`lib/anthropic/system-prompt.ts`](lib/anthropic/system-prompt.ts) (5-minute TTL; subsequent pages in the same run reuse the cache). Set `ANTHROPIC_DEBUG_USAGE=1` to log token usage including `cache_read_input_tokens`.

Each `AuditCheck` carries a stable `key`, a numeric `score: 0..100`, and a categorical `result` (pass / warn / fail). The keys are the contract for [`lib/audit/diff.ts`](lib/audit/diff.ts), which surfaces per-check changes between consecutive audits on the audit detail page, and for the community-level `Score over time` chart in [`components/communities/AuditTrend.tsx`](components/communities/AuditTrend.tsx).

PSI calls add roughly 15–25 s per page; the runner concurrency is capped at 3 simultaneous pages so a 10-page audit completes well inside the 300 s background-runner budget.

**Additional automated layers** (same graceful-degrade behavior):

| Layer | Where it shows | Env / notes |
|---|---|---|
| Site-wide probes | `audits.site_wide_checks` | Robots.txt, AI bot rules, sitemap discovery — no dedicated key beyond the crawler |
| Chrome UX Report (CrUX) | `audits.crux_field_checks` | Enable Chrome UX Report API in Google Cloud; `CRUX_API_KEY` optional (falls back to `PSI_API_KEY`) |
| Near-duplicate cohort | `audits.near_duplicate_checks` | Simhash pairs across URLs fetched this run — `AUDIT_NEAR_DUP_MAX_PAGES` (0 = off), `AUDIT_NEAR_DUP_HAMMING_MAX`, `AUDIT_NEAR_DUP_MAX_PAIRS` |
| axe WCAG scans | GEO checks on each page row | `AUDIT_RUN_AXE=1` or `true`. Runs in jsdom (not a full browser) — some pages time out or fail; use `AUDIT_RUN_AXE_TIMEOUT_MS` (3–120s, default 25s), `AUDIT_RUN_AXE_DEBUG=1`, or Lighthouse in the browser for definitive a11y. |

### Three kinds of audit findings

1. **Automated results (each run)** — Per-page SEO/GEO JSON on `audit_pages`, plus origin-level blobs on `audits` (`site_wide_checks`, `crux_field_checks`, `near_duplicate_checks`). Empty sections mean the engine skipped that layer (missing keys, timeouts, quotas, insufficient CrUX coverage, or env disabled) — **not** a human checklist omission.
2. **Expert checklist (human sign-off, per community)** — Coarse rows in [`lib/checklists/community-manual.ts`](geo-seo-audit-tool/lib/checklists/community-manual.ts); saved as `communities.manual_check_results`. Edited **only from the community page** (`/communities/[id]`); not inlined on `/audits` web routes. **PDF exports** may still bundle the checklist. Saving once **prunes JSON keys** that belonged to retired template rows so the DB stays tidy.
3. **Per-page `manual_notes`** — Free-form reviewer notes stored on [`audit_pages.manual_notes`](geo-seo-audit-tool/types/database.ts); independent of both automated checks and the expert checklist.

---

## Database Schema (Supabase)

```sql
-- Managed by Supabase Auth
auth.users

-- Companies (e.g. "Compass Senior Living")
create table companies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  logo_url    text,
  contact_name  text,
  contact_email text,
  notes       text,
  created_at  timestamptz default now()
);

-- Individual communities / websites
create table communities (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies not null,
  name        text not null,
  website_url text not null,
  created_at  timestamptz default now()
);

-- Audit runs
create table audits (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid references communities not null,
  status          text default 'pending',   -- pending, running, complete, failed
  score           int,
  seo_score       int,
  geo_score       int,
  pages_crawled   int default 0,
  created_at      timestamptz default now()
);

-- Per-page results within an audit
create table audit_pages (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid references audits not null,
  url           text not null,
  score         int,
  seo_results   jsonb,
  geo_results   jsonb,
  fixes         jsonb,
  manual_notes  text,
  created_at    timestamptz default now()
);

-- Stripe subscriptions
create table subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users not null,
  stripe_customer_id  text,
  stripe_sub_id       text,
  plan                text,   -- free, pro, agency
  status              text,   -- active, canceled, past_due
  created_at          timestamptz default now()
);
```

---

## Environment Variables

```bash
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Stripe (see .env.example for all `STRIPE_PRICE_*` keys and docs/stripe-dashboard-setup.md)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
# Per-tier recurring Price IDs from the Stripe Dashboard (test vs live)
# STRIPE_PRICE_RESIDENCE_MONTHLY= price_...
# ... (full list in .env.example)
# Optional: show Partner program checkout in Settings
# NEXT_PUBLIC_SHOW_PARTNER_CHECKOUT=1
```

---

## Core Features

### 1. Authentication
- Email/password login via Supabase Auth
- Protected routes via middleware
- Session management with `@supabase/ssr`

### 2. Company & Community Management
- Create / edit / delete companies
- Add multiple communities per company
- Each community has its own website URL and audit history

### 3. Site Crawling
- **Step 1:** Try fetching `sitemap.xml` or `sitemap_index.xml`
- **Step 2:** Fall back to recursive HTML crawl if no sitemap found
- Cap crawl at 50 pages per audit to stay within API limits
- Deduplicate URLs and filter out non-HTML assets

### 4. AI-Powered Audit (per page)
Each crawled page is analyzed by Claude for:

**SEO Checks**
- Meta title (present, length, keyword relevance)
- Meta description (present, compelling, correct length)
- H1 heading (single, keyword-optimized)
- H2 subheadings (structure and hierarchy)
- Image alt text (all images covered)
- Mobile viewport (meta tag configured)
- Schema markup (JSON-LD / microdata present)
- Internal linking (links to other site pages)
- HTTPS (secure protocol)
- Canonical tag (present and correct)

**GEO Checks**
- FAQ / Q&A content (direct question-answer format)
- Entity information (name, address, services clear)
- NAP consistency (name, address, phone match)
- Content depth (enough for AI to summarize)
- Expertise signals (credentials, staff, trust badges)
- Local relevance (location-specific content)
- Structured answers (content formatted for AI extraction)
- Outbound citations (links to authoritative sources)

Each check returns: `pass | warn | fail` + a one-line explanation.

### 5. Scoring
- Per-page score (0–100)
- SEO subscore and GEO subscore
- Overall community score (average across all pages)
- Score history tracked over time per community

### 6. Audit Report
- Full pass/fail breakdown per page
- Prioritized fix list (high / medium / low)
- Expert checklist edits live on **community detail** (`/communities/[id]`); optional per-page free-form notes (`manual_notes`) on audit pages
- Score trend chart (audit history)
- Compare two audits side by side

### 7. PDF Export
- Branded InyoCare report template via `@react-pdf/renderer`
- Includes: summary scorecard, automated site-wide/CrUX/near-dup sections, **expert checklist appendix** from community snapshot, per-check results, fix list, per-page notes when supplied
- Uploaded to Supabase Storage
- Shareable download link generated

### 8. Realtime Audit Progress
- Supabase Realtime subscription on the `audits` table
- Live progress bar updates as each page is analyzed
- No polling required

### 9. Stripe Billing (subscriptions tracked; usage limits not enforced yet)
- **Tiers:** Residence, Community, and Portfolio (monthly / yearly) plus **Partner program** (invite-oriented label—avoid calling it an “internal discount” in customer-facing copy).
- **Settings (`/settings`):** pricing cards → Stripe Checkout; **Manage billing** opens the Stripe Customer Portal when a `stripe_customer_id` exists.
- **`POST /api/stripe/webhook`:** verifies signatures and upserts `public.subscriptions` with the **service role** key (`plan` stores a slug such as `community_monthly`; status mirrors Stripe).
- **Partner checkout button:** hidden by default; set `NEXT_PUBLIC_SHOW_PARTNER_CHECKOUT=1` and `STRIPE_PRICE_PARTNER_MONTHLY` when you want signed-in users to self-serve that tier.
- **Dashboard setup:** [docs/stripe-dashboard-setup.md](docs/stripe-dashboard-setup.md) — create Products/Prices (test mode first), enable Customer Portal, register webhook events (`checkout.session.completed`, `customer.subscription.*`).
- **Out of scope for now:** enforcing audit/community/page caps by plan (subscription row exists for future gating).

---

## Data Flow

```
User enters URL
      ↓
API: /api/audit/crawl
  → Fetch sitemap.xml
  → Fallback: crawl from homepage
  → Return list of URLs (max 50)
      ↓
API: /api/audit/analyze (called per page)
  → Fetch page HTML
  → Send to Anthropic API with audit prompt
  → Parse JSON response
  → Save results to audit_pages table
  → Update audit score in audits table
      ↓
Supabase Realtime
  → Pushes progress updates to frontend
      ↓
Audit complete
  → Full report rendered on screen
  → Option to export PDF → saved to Supabase Storage
```

---

## Pages & Routes

| Route | Description |
|---|---|
| `/login` | Sign in |
| `/dashboard` | Overview — all companies, scores, recent audits |
| `/companies` | List all companies |
| `/companies/new` | Create a new company |
| `/companies/[id]` | Company detail — communities + scores |
| `/communities/[id]` | Community detail — audit history + score trend |
| `/communities/[id]/new-audit` | Run a new audit |
| `/audits/[id]` | Full audit report |
| `/audits/[id]/export` | PDF export preview + download |
| `/settings` | Account settings, plan, billing portal |

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/inyocare/audit-tool.git
cd audit-tool

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in Supabase, Anthropic, and Stripe keys

# 4. Run Supabase migrations
npx supabase db push

# 5. Start dev server
npm run dev
```

---

## Audit Runner

The audit pipeline runs as a background job that **must outlive** the originating Server Action's request, so it cannot rely on the user's cookies.

- The `startAudit` server action validates access, enforces the per-org rate limit, refuses to start a duplicate audit while one is still in flight, inserts the `audits` row + an `audit_jobs` row, and finally fires a non-awaited `POST` to `/api/audits/[id]/run` with the shared header `x-audit-runner-token: $AUDIT_RUNNER_SECRET`. The action then redirects to the detail page.
- `/api/audits/[id]/run` (Node runtime, `maxDuration = 300`) uses a **service-role** Supabase client (`lib/supabase/service.ts`) so RLS is bypassed only for this background work. Access was already enforced in the action. The route delegates to `claimAndRunOne` so the runner lease serializes against any concurrent cron tick.
- The detail page polls `/api/audits/[id]/snapshot` for live progress (in-flight guard, visibility pause, 3-strike error toast).

Required environment variables: `SUPABASE_SERVICE_ROLE_KEY`, `AUDIT_RUNNER_SECRET`, `NEXT_PUBLIC_SITE_URL` (or Vercel injects `VERCEL_URL`), and `CRON_SECRET` for scheduled queue ticks.

### Queue & resilience (Phase 10)

The runner used to be HTTP fire-and-forget — if Vercel killed the function or the network blipped, audits silently stuck in `running`. Phase 10 makes the system durable without adding a new vendor.

- **Durable queue.** `audit_jobs` (migration `009_audit_ops.sql`) holds one row per audit run with `status`, `attempts`, `max_attempts`, `lease_until`, `last_error`. A unique partial index on `(audit_id) where status in ('queued','running')` gives idempotency: double-clicking *Run new audit* never produces two jobs.
- **Lease window.** A runner claims a job by atomically flipping `status = 'running'` and writing `lease_until = now() + 8 minutes`, comfortably longer than the route's 300 s `maxDuration`. Once the lease expires the job is reapable.
- **Vercel Cron tick.** `vercel.json` schedules `/api/audits/cron-tick` once a minute. The route authorizes by `Authorization: Bearer $CRON_SECRET` (auto-injected by Vercel) or the existing `x-audit-runner-token` for manual ops. Each tick claims up to 3 queued / abandoned-lease jobs and runs them; this is what recovers a Vercel-killed runner.
- **Retry policy.** Default `max_attempts = 3`. After a thrown error, the queue helper requeues (`status = 'queued'`, `lease_until = null`) and resets `audits.status = 'pending'` so the UI doesn't flash "failed" between attempts. Once attempts are exhausted, the helper marks the job `failed` and calls `markAuditFailed`.
- **Cancel semantics.** A *Cancel* button appears on `AuditScoreCard` whenever the audit is `pending` or `running`. The action sets `audits.status = 'cancelled'`; the running runner observes this between scoring batches (typically within ~25 s) and exits cleanly without clobbering `pages_crawled` / `progress_total` / scores. The queue helper then marks the job `cancelled`. No retry on cancel — it is terminal by user intent.
- **Per-org rate limit.** `consume_rate_limit(...)` (security-definer, atomic `select for update`) caps audit starts at **100 per company per hour**. Exhaustion returns a friendly error toast; the audit row is never inserted.
- **`cancelled` status.** `AuditStatus` now includes `'cancelled'`; `StatusBadge` renders it as a muted secondary badge. The community trend chart (`AuditTrend`) only plots `complete` audits, so cancelled runs do not pollute history.

### Category & URL selection (Phase 11)

Audits no longer hard-cap at 10 pages with no user input. The new-audit page probes the site's sitemap server-side and renders a category picker with **per-URL checkboxes** plus a configurable URL cap.

- **Sitemap shards become categories.** `lib/crawler/sitemap.ts → fetchSitemapShards` walks `robots.txt` and the common sitemap paths, follows `sitemapindex` files, and returns one shard per leaf `urlset` along with its full URL list. Friendly labels (`Pages`, `Posts`, `Categories`, `Products`, `Tags`, `Authors`, `Attachments`, plus titlecased fallbacks) and sort priority come from `lib/crawler/shard-labels.ts`. Sites with only a flat sitemap collapse to a single "All pages" shard; sites with no sitemap render a fallback notice and the runner falls back to a same-origin BFS crawl.
- **Per-URL picker.** `components/audits/StartAuditForm.tsx` renders each category as a native `<details>` disclosure containing a scrollable checkbox list of every URL in the shard. The shard header has a select-all / clear / indeterminate parent checkbox, and the page slices each shard's URL list to a **1,000-URL preview ceiling** (matches the audit hard cap). Shards with more URLs surface a "Showing first N of M URLs" footer.
- **Form guards.** `max_pages` numeric input (default 100, range 1..1000) plus a live "Plan" footer summing the deduped union of selected URLs. The form blocks submit when zero URLs are selected and when the selection exceeds `max_pages`. Selecting more than ~50 URLs adds a cost note; more than ~300 surfaces a hard runtime warning that the run may exceed the 300 s function timeout.
- **Persistence.** Migration `010_audit_selection.sql` adds `audits.max_pages int` and `audits.shard_urls text[]`. Migration `011_audit_target_urls.sql` adds `audits.target_urls text[]` — the explicit page-URL allowlist. All three columns are nullable for back-compat. The `startAudit` action validates `max_pages` (1..1000), enforces same-origin / http(s) on every selected URL, dedupes, and persists `target_urls` (required for new submissions) plus `shard_urls` (analytics metadata: which categories contributed at least one URL).
- **Runner precedence.** `lib/audit/run.ts → resolveUrls` checks `target_urls` first (re-applies same-origin + asset filters defensively, then dedupes and caps at `max_pages`), then `shard_urls` via `fetchUrlsFromShards`, then the legacy sitemap-then-crawl fallback. Old audit rows without `target_urls` or `shard_urls` continue to use the 10-page legacy default unchanged.

---

## Security

The application has been through a launch-prep security pass: SSRF guard
on all outbound crawler/sitemap/site-wide fetches, security headers via
[`proxy.ts`](proxy.ts) (HSTS, X-Frame-Options, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy, Content-Security-Policy in
report-only mode with violations sinking to `/api/csp-report`),
prompt-injection mitigation on the Anthropic call (fenced data delimiters
plus an explicit untrusted-input directive in
[`AUDIT_VOICE_INSTRUCTION`](lib/anthropic/system-prompt.ts)), bounded body
reads on native `fetch()` (see
[`lib/security/bounded-fetch.ts`](lib/security/bounded-fetch.ts)), and
explicit `consumeRateLimit` coverage on every auth + mutation server
action with IP-keyed buckets for unauthenticated paths via
[`lib/security/client-ip.ts`](lib/security/client-ip.ts).

### Testing

Unit tests live next to the code under `lib/**/*.test.ts` and run on
[Vitest](https://vitest.dev). The suite is intentionally narrow: pure
helpers (URL normalization, the SSRF blocklist, deterministic scoring,
validation schemas, the body-size cap) where a regression would silently
break a launch-blocking guarantee.

```bash
# All unit tests, single pass
npm test

# Watch mode (re-runs on save)
npm run test:watch

# Coverage report (HTML at ./coverage/index.html)
npm run test:coverage

# A single file
npx vitest run lib/security/ssrf.test.ts

# Type-check + lint without running tests
npm run typecheck
npm run lint
```

Heavier integration tests of the audit runner against a real Supabase
instance, React component tests, and Playwright E2E are intentionally
deferred — see "Out of scope" in the CI plan. New unit tests should
target `lib/` (no Supabase / network / Anthropic side effects) and live
beside the file they cover.

### Known accepted advisories

`npm audit` reports the following advisory at the time of writing. It is
documented here rather than auto-fixed because the auto-fix downgrades
Next.js by several major versions and we have not observed exposure to
the issue in our compile-time-only PostCSS usage.

| Advisory | Path | Severity | Status |
|---|---|---|---|
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — PostCSS XSS via unescaped `</style>` in stringify output | `next > postcss` (transitive) | moderate | Accepted |

**Why we accept it.** PostCSS is invoked at build time over our own
Tailwind / CSS sources, never against attacker-controlled CSS. The XSS
vector requires PostCSS to stringify untrusted CSS into HTML output,
which we do not do. The advisory notes the upstream fix shipped in
`postcss@8.5.10`; we will inherit that automatically when Next.js bumps
its lockfile pin (the official Next.js fix has not yet landed).

**Cadence.** Re-run `npm audit` weekly; if a new fix becomes available
through Next.js without breaking changes, update the lockfile and
remove this row.

---

## Deployment

1. Push to GitHub
2. Connect repo to Vercel
3. Add all environment variables in Vercel dashboard
4. Vercel auto-deploys on every push to `main`
5. Set Stripe webhook endpoint to `https://yourdomain.com/api/stripe/webhook` (same events as [docs/stripe-dashboard-setup.md](docs/stripe-dashboard-setup.md)); paste live signing secret into `STRIPE_WEBHOOK_SECRET`.
6. Copy **live** Price IDs into production env vars (`STRIPE_PRICE_*`).

---

## Milestones

| Phase | Scope | Est. Time |
|---|---|---|
| 1 | Project setup, Supabase schema, Auth (login/logout) | 0.5 day |
| 2 | Company + Community CRUD | 0.5 day |
| 3 | Sitemap crawler + page fetcher | 1 day |
| 4 | Anthropic audit logic + API route | 1 day |
| 5 | Audit report UI + scoring | 1 day |
| 6 | Realtime progress + audit history | 0.5 day |
| 7 | PDF export + Supabase Storage ✅ | 1 day |
| 8 | Hardening: detached runner, error boundary, sitemap same-origin, invite/next, polling resilience ✅ | 0.5 day |
| 9 | Real audit engine (deterministic + PSI + Anthropic tool-use) + per-page diffs + community trend ✅ | 1.5 days |
| 10 | Audit ops & resilience: Postgres queue + lease + Vercel Cron reaper, cancel button, per-org rate limit ✅ | 1 day |
| 11 | Audit category selection: sitemap-shard picker, configurable max_pages (1..1000) ✅ | 0.5 day |
| 12 | Stripe billing (Checkout + webhook sync + Settings UI) ✅ | 1 day |
| 13 | Polish, error handling, deploy to Vercel | 0.5 day |
| **Total** | | **~7 days** |

---

## Future Enhancements

- Bulk audit — run all communities for a company at once
- Score drop alerts — email notification when score falls
- Competitor comparison — audit two URLs side by side
- White-label reports — client-branded PDF exports
- Google Search Console integration — real ranking data
- Google PageSpeed API — add performance scores
- Long-form content templates layered on expert checklist + `manual_notes` (product copy)