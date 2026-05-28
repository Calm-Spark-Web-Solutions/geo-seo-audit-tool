export type AuditStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";

export type AuditJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AuditJob {
  id: string;
  audit_id: string;
  status: AuditJobStatus;
  attempts: number;
  max_attempts: number;
  lease_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Latest `audit_jobs` row surfaced on the audit report (runner retries / errors). */
export interface AuditQueueDiagnostics {
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
  /** Present when a job row exists; correlates with `audit_jobs.id`. */
  jobId: string | null;
  jobStatus: AuditJobStatus | null;
  leaseUntil: string | null;
  jobUpdatedAt: string | null;
}

export type CheckResult = "pass" | "warn" | "fail";

export type FixPriority = "high" | "medium" | "low";

export interface Company {
  id: string;
  user_id: string;
  name: string;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
}

export type ManualVerificationStatus =
  | "unreviewed"
  | "pass"
  | "warn"
  | "fail";

/** Per-community manual checklist row (stored under `manual_check_results`). */
export interface CommunityManualCheckEntry {
  status: ManualVerificationStatus;
  notes?: string;
  updated_at?: string;
}

/** Keyed by stable `manual_key` from COMMUNITY_MANUAL_ITEMS. */
export type CommunityManualResults = Partial<
  Record<string, CommunityManualCheckEntry>
>;

/** Row shape for exporting manual checklist in PDF payloads. */
export interface ManualChecklistPdfRow {
  key: string;
  category: string;
  label: string;
  helper?: string;
  status: ManualVerificationStatus;
  notes: string;
}

export interface Community {
  id: string;
  company_id: string;
  name: string;
  website_url: string;
  /** Senior-living facility niche; nullable for legacy rows. */
  facility_type: string | null;
  /** Human-recorded checklist; shared across audits until updated. */
  manual_check_results?: CommunityManualResults | null;
  created_at: string;
}

export interface Audit {
  id: string;
  community_id: string;
  status: AuditStatus;
  score: number | null;
  seo_score: number | null;
  geo_score: number | null;
  pages_crawled: number;
  progress_total: number | null;
  /** Origin-level probes (robots, sitemap); merged in UI/PDF, not duplicated per URL. */
  site_wide_checks?: AuditCheck[] | null;
  /** Origin-level Chrome UX Report (CrUX) p75 metrics when fetch succeeds. */
  crux_field_checks?: AuditCheck[] | null;
  /** GSC/GA4 API checks when Google is connected and properties are mapped. */
  google_field_checks?: AuditCheck[] | null;
  /** 28-day GSC/GA4 totals captured when the scan completed. */
  google_metrics?: GoogleMetricsJson | null;
  /** Cross-page duplicate title / meta description checks; populated after crawl. */
  near_duplicate_checks?: AuditCheck[] | null;
  report_pdf_path: string | null;
  report_generated_at: string | null;
  engine_version?: number;
  // User-selected URL cap for this run (1..1000). null on legacy rows.
  max_pages: number | null;
  // Selected sitemap shard URLs scoping the crawl. null/empty on legacy rows.
  shard_urls: string[] | null;
  // Explicit per-page URL allowlist. Takes precedence over shard_urls when set.
  target_urls: string[] | null;
  created_at: string;
  /** When false, does not count toward monthly manual scan quota (tracked-only rescans). */
  consumes_manual_quota?: boolean;
  /** Planned URLs whose HTML fetch failed (partial crawls). */
  fetch_failures?: AuditFetchFailure[] | null;
}

export interface AuditFetchFailure {
  url: string;
  reason: string;
}

export interface GoogleMetricsJson {
  gsc_clicks_28d: number;
  gsc_impressions_28d: number;
  ga4_sessions_28d: number;
  ga4_active_users_28d: number;
}

/**
 * One row from a GSC `searchAnalytics.query` response with the `query`
 * dimension. Persisted as JSON inside
 * `community_google_metrics_snapshots.gsc_top_queries`.
 */
export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  /** Avg result position; lower is better. */
  position: number;
  /** Click-through rate as a fraction (0..1). */
  ctr: number;
}

/** Same shape as `GscQueryRow` but keyed by landing page URL. */
export interface GscPageRow {
  page: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

/** GA4 sessions originating from a known AI-assistant hostname. */
export interface GaAiReferral {
  /** Raw `sessionSource` value reported by GA4. */
  source: string;
  /** Friendly display label (e.g. "ChatGPT"). */
  label: string;
  /** Optional vendor grouping (e.g. "OpenAI"). */
  group?: string;
  sessions: number;
  activeUsers: number;
}

export interface CommunityGoogleMetricsSnapshot {
  community_id: string;
  snapshot_date: string;
  gsc_clicks_28d: number | null;
  gsc_impressions_28d: number | null;
  ga4_sessions_28d: number | null;
  ga4_active_users_28d: number | null;
  source: "audit" | "daily_sync";
  audit_id: string | null;
  /** Top GSC queries (28d); null on legacy rows pre-migration 029. */
  gsc_top_queries?: GscQueryRow[] | null;
  /** Top GSC landing pages (28d); null on legacy rows pre-migration 029. */
  gsc_top_pages?: GscPageRow[] | null;
  /** GA4 sessions per AI assistant hostname (28d); null on legacy rows. */
  ga4_ai_referrals?: GaAiReferral[] | null;
}

/** Optional structured p75 sample for Chrome UX Report metric rows (new audits). */
export interface AuditCheckCruxSample {
  value: number;
  unit: "ms" | "cls";
}

export type AuditCheckEvidenceItem =
  | { type: "link"; url: string; anchor?: string; rel?: string }
  | { type: "image"; src: string; alt?: string; nearText?: string }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "schema"; schemaType: string; sample?: string }
  | {
      type: "psi_audit";
      id: string;
      title: string;
      result: CheckResult;
      score: number | null;
      displayValue?: string;
      description?: string;
    }
  | { type: "kv"; label: string; value: string };

/** Optional structured evidence per AuditCheck — renders under the explanation. */
export interface AuditCheckEvidence {
  /** Total items found; UI shows "+N more" when items.length < totalCount. */
  totalCount?: number;
  items: AuditCheckEvidenceItem[];
  /**
   * Nav/header/footer (and other non–primary-content) link samples for the
   * internal-links inspector. `totalCount` / `items` are in-content links only.
   */
  chromeTotalCount?: number;
  chromeItems?: AuditCheckEvidenceItem[];
  /** Inspector route slug (under per-page audit detail) where the full list lives. */
  inspector?: "links" | "images" | "schema" | "lighthouse";
  /**
   * Imperative next steps for implementers (e.g. AI GEO subscores).
   * Shown in PDF / UI below the explanation, separate from `items` examples.
   */
  guidanceLines?: string[];
}

export interface AuditCheck {
  key: string;
  label: string;
  result: CheckResult;
  explanation: string;
  // 0..100 numeric score. Optional for back-compat with audit_pages rows
  // persisted before the layered scoring engine landed (Phase 9).
  score?: number;
  /** When true, omitted from this page's SEO/GEO category averages (manual override). */
  excludeFromScore?: boolean;
  /** Optional UX/PDF grouping; omitted on legacy persisted rows. */
  category?: string;
  pillar?: "SEO" | "GEO";
  /** CrUX p75 value + unit when row is a Field metrics histogram metric. */
  cruxSample?: AuditCheckCruxSample;
  /** Sample items proving why this row passed/warned/failed. */
  evidence?: AuditCheckEvidence;
}

export interface FixItem {
  priority: FixPriority;
  title: string;
  detail: string;
}

export interface AuditPage {
  id: string;
  audit_id: string;
  url: string;
  score: number | null;
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
  fixes: FixItem[] | null;
  manual_notes: string | null;
  ai_comment: string | null;
  /** When true, this URL is omitted from parent audit-level score averages. */
  exclude_from_audit_score?: boolean;
  /** Sitemap shard label (e.g. Pages, Posts); null on legacy runs without shards. */
  sitemap_category_label?: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  plan: string | null;
  status: string | null;
  /**
   * Optional per-account override (`PlanLimits` shape) — `null` means "use
   * the slug defaults from `lib/billing/plan-limits.ts`". The Stripe webhook
   * mirrors the subscription item's quantity here as `{ communities: N }`.
   */
  plan_limits: Record<string, unknown> | null;
  created_at: string;
}

export type CompanyRole = "owner" | "admin" | "member";

export interface CompanyMember {
  company_id: string;
  user_id: string;
  role: CompanyRole;
  created_at: string;
}

/** Row from `list_company_members_with_email` RPC (roster in Team UI). */
export interface CompanyMemberWithEmail {
  user_id: string;
  email: string;
  role: CompanyRole;
  created_at: string;
}

export interface CompanyInvite {
  id: string;
  company_id: string;
  email: string;
  role: CompanyRole;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface CrawlResult {
  urls: string[];
  source: "sitemap" | "crawl";
}
