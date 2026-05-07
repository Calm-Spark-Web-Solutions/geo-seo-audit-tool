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
│   │   │   ├── webhook/route.ts          # Stripe webhook handler
│   │   │   └── portal/route.ts           # Customer portal redirect
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
│   │   └── page-comment.ts               # Per-page Haiku commentary
│   ├── crawler/
│   │   ├── fetch.ts                      # Shared HTML fetch
│   │   ├── sitemap.ts                    # Fetch + parse sitemap.xml
│   │   └── crawl.ts                      # Fallback HTML crawler
│   ├── stripe/
│   │   └── client.ts                     # Stripe helpers
│   └── pdf/
│       ├── report.tsx                    # React PDF document (per-page report)
│       └── render.ts                     # Buffer renderer + RLS-aware payload loader
├── types/
│   └── index.ts                          # Shared TypeScript types
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql        # DB schema
│       ├── 002_company_members_invites.sql
│       ├── 003_audit_pages_ai_comment.sql
│       ├── 004_audits_progress.sql
│       └── 005_audit_report_storage.sql  # PDF columns + audit-reports bucket + RLS
└── .env.local                            # Environment variables
```

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

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
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
- Manual notes field per page for InyoCare team
- Score trend chart (audit history)
- Compare two audits side by side

### 7. PDF Export
- Branded InyoCare report template via `@react-pdf/renderer`
- Includes: summary scorecard, per-check results, fix list, manual notes
- Uploaded to Supabase Storage
- Shareable download link generated

### 8. Realtime Audit Progress
- Supabase Realtime subscription on the `audits` table
- Live progress bar updates as each page is analyzed
- No polling required

### 9. Stripe Billing (Optional / Future)
- **Free plan:** 5 audits/month, 1 company
- **Pro plan:** Unlimited audits, unlimited companies, PDF export
- **Agency plan:** Everything in Pro + white-label PDF reports
- Stripe Customer Portal for self-serve plan management
- Webhooks sync subscription status back to Supabase

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

## Deployment

1. Push to GitHub
2. Connect repo to Vercel
3. Add all environment variables in Vercel dashboard
4. Vercel auto-deploys on every push to `main`
5. Set Stripe webhook endpoint to `https://yourdomain.com/api/stripe/webhook`

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
| 8 | Stripe billing (optional) | 1 day |
| 9 | Polish, error handling, deploy to Vercel | 0.5 day |
| **Total** | | **~7 days** |

---

## Future Enhancements

- Bulk audit — run all communities for a company at once
- Score drop alerts — email notification when score falls
- Competitor comparison — audit two URLs side by side
- White-label reports — client-branded PDF exports
- Google Search Console integration — real ranking data
- Google PageSpeed API — add performance scores
- Manual audit notes template — standardized InyoCare commentary