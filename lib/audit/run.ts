import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuditCheck } from "@/types";
import { crawlSite } from "@/lib/crawler/crawl";
import { fetchPageHtml } from "@/lib/crawler/fetch";
import {
  DEFAULT_USER_AGENT,
  isAssetUrl,
  normalizeUrl,
  sameOrigin,
} from "@/lib/crawler/normalize";
import {
  buildUrlToSitemapCategoryLabelMap,
  fetchSitemap,
  fetchUrlsFromShards,
} from "@/lib/crawler/sitemap";
import { recalculateAuditRollupScores } from "@/lib/audit/rollup-scores";
import {
  categoryScoreEffective,
  overallPageScoreFromChecks,
} from "@/lib/scoring/effective-scores";
import { scoreAndAnalyzePage } from "@/lib/scoring";
import { runCruxOriginChecks } from "@/lib/scoring/crux";
import { detectLikelyPasswordGate } from "@/lib/scoring/password-gate";
import { runSiteWideChecks } from "@/lib/scoring/site-wide";

/**
 * Cap used for audits inserted before Phase 11 (audit category selection),
 * which did not persist a per-audit `max_pages`. Older runs continue to
 * behave exactly as they used to.
 */
const LEGACY_MAX_PAGES = 10;
const HARD_PAGE_CEILING = 1000;
const FETCH_TIMEOUT_MS = 8000;
const FETCH_BATCH_SIZE = 5;
const SCORE_CONCURRENCY = 3;
const ENGINE_VERSION = 4;

interface PageWork {
  url: string;
  html: string;
}

/**
 * Cheap status probe used inside the per-batch loop. Returns `true` when
 * the audit has been cancelled and the runner should exit cleanly without
 * touching status / progress_total / pages_crawled.
 */
async function isAuditCancelled(
  supabase: SupabaseClient,
  auditId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("audits")
    .select("status")
    .eq("id", auditId)
    .maybeSingle();
  return data?.status === "cancelled";
}

/**
 * Clamp the per-audit page cap to [1, HARD_PAGE_CEILING]. Falls back to
 * LEGACY_MAX_PAGES when the audit row has no `max_pages` (rows inserted
 * before Phase 11). Bogus values are coerced to LEGACY_MAX_PAGES rather
 * than failing the run.
 */
function clampPageCap(raw: number | null): number {
  if (raw === null || !Number.isFinite(raw)) return LEGACY_MAX_PAGES;
  if (raw < 1) return 1;
  if (raw > HARD_PAGE_CEILING) return HARD_PAGE_CEILING;
  return Math.floor(raw);
}

async function fetchAllHtml(urls: string[]): Promise<PageWork[]> {
  const out: PageWork[] = [];
  for (let i = 0; i < urls.length; i += FETCH_BATCH_SIZE) {
    const slice = urls.slice(i, i + FETCH_BATCH_SIZE);
    const batch = await Promise.all(
      slice.map(async (url) => {
        const html = await fetchPageHtml(url, {
          timeoutMs: FETCH_TIMEOUT_MS,
          userAgent: DEFAULT_USER_AGENT,
        });
        return html ? { url, html } : null;
      }),
    );
    for (const p of batch) {
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * Defensive normalize for an explicit URL allowlist persisted on the audit
 * row. Even though the action validated, we re-apply same-origin and asset
 * filters and dedupe so a tampered DB row can never make the runner fan out
 * to a third-party host.
 */
function normalizeTargetUrls(
  base: string,
  raw: string[],
  maxPages: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizeUrl(candidate);
    if (!normalized) continue;
    if (!sameOrigin(base, normalized)) continue;
    if (isAssetUrl(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= maxPages) break;
  }
  return out;
}

/**
 * Resolve the URL list for this audit. Precedence:
 *
 *   1. `target_urls` — the explicit allowlist the user picked on the form.
 *   2. `shard_urls` — pull URLs from selected sitemap shards.
 *   3. Legacy sitemap-then-crawl fallback so audits inserted before Phase 11
 *      still run with no selection persisted.
 */
async function resolveUrls(
  base: string,
  maxPages: number,
  shardUrls: string[] | null,
  targetUrls: string[] | null,
): Promise<string[]> {
  if (targetUrls && targetUrls.length > 0) {
    const normalized = normalizeTargetUrls(base, targetUrls, maxPages);
    if (normalized.length > 0) return normalized;
    // Fall through to shard / sitemap if every target URL was filtered out
    // (e.g. all were foreign-origin in a tampered row).
  }

  if (shardUrls && shardUrls.length > 0) {
    return fetchUrlsFromShards(shardUrls, base, {
      maxPages,
      timeoutMs: FETCH_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
    });
  }

  const fromSitemap = await fetchSitemap(base, {
    maxPages,
    timeoutMs: FETCH_TIMEOUT_MS,
    userAgent: DEFAULT_USER_AGENT,
  });
  if (fromSitemap.length > 0) return fromSitemap;

  return crawlSite(base, {
    maxPages,
    timeoutMs: FETCH_TIMEOUT_MS,
    userAgent: DEFAULT_USER_AGENT,
  });
}

/**
 * Crawl up to the configured page cap, score each page through the layered
 * engine (deterministic + PSI + Anthropic), persist audit_pages, and
 * update the parent audits row. Streams progress: progress_total set
 * after URL discovery, pages_crawled increments per scored batch.
 */
export async function runAudit({
  supabase,
  auditId,
  websiteUrl,
}: {
  supabase: SupabaseClient;
  auditId: string;
  websiteUrl: string;
}): Promise<void> {
  const base = normalizeUrl(websiteUrl);
  if (!base) {
    await supabase
      .from("audits")
      .update({
        status: "failed",
        pages_crawled: 0,
        progress_total: 0,
        score: null,
        seo_score: null,
        geo_score: null,
      })
      .eq("id", auditId);
    throw new Error("Invalid website URL");
  }

  // Read the user's selection (may be null for legacy audit rows). Then
  // mark the audit `running` so the live UI flips out of `pending`.
  const { data: auditRow } = await supabase
    .from("audits")
    .select("max_pages, shard_urls, target_urls, status")
    .eq("id", auditId)
    .maybeSingle();

  if (auditRow?.status === "cancelled") {
    return;
  }

  const maxPages = clampPageCap(
    (auditRow?.max_pages as number | null | undefined) ?? null,
  );
  const shardUrls =
    (auditRow?.shard_urls as string[] | null | undefined) ?? null;
  const targetUrls =
    (auditRow?.target_urls as string[] | null | undefined) ?? null;

  await supabase
    .from("audits")
    .update({ status: "running", engine_version: ENGINE_VERSION })
    .eq("id", auditId);

  let siteWideChecks: AuditCheck[] = [];
  try {
    siteWideChecks = await runSiteWideChecks(base);
  } catch {
    siteWideChecks = [];
  }

  let cruxFieldChecks: AuditCheck[] = [];
  try {
    cruxFieldChecks = await runCruxOriginChecks(base);
  } catch {
    cruxFieldChecks = [];
  }

  await supabase
    .from("audits")
    .update({
      site_wide_checks: siteWideChecks,
      crux_field_checks: cruxFieldChecks,
    })
    .eq("id", auditId);

  const urls = await resolveUrls(base, maxPages, shardUrls, targetUrls);

  let categoryByUrl = new Map<string, string>();
  if (shardUrls && shardUrls.length > 0) {
    categoryByUrl = await buildUrlToSitemapCategoryLabelMap(
      shardUrls,
      base,
      {
        timeoutMs: FETCH_TIMEOUT_MS,
        userAgent: DEFAULT_USER_AGENT,
      },
      new Set(urls),
    );
  }

  await supabase
    .from("audits")
    .update({ progress_total: urls.length })
    .eq("id", auditId);

  if (urls.length === 0) {
    await supabase
      .from("audits")
      .update({
        status: "complete",
        pages_crawled: 0,
        progress_total: 0,
        score: null,
        seo_score: null,
        geo_score: null,
        near_duplicate_checks: [],
      })
      .eq("id", auditId);
    return;
  }

  if (await isAuditCancelled(supabase, auditId)) return;

  const work = await fetchAllHtml(urls);

  let pagesCrawled = 0;

  // Running rollup aggregates so the live UI sees averages update without
  // re-reading every audit_pages row from Postgres on each batch (the old
  // implementation was O(N^2) in pages and dominated egress for large
  // audits — see lib/audit/rollup-scores.ts).
  let seoSum = 0;
  let seoN = 0;
  let geoSum = 0;
  let geoN = 0;
  let totalSum = 0;
  let totalN = 0;
  const avg = (sum: number, n: number) => (n > 0 ? Math.round(sum / n) : null);

  // Score in concurrent batches of SCORE_CONCURRENCY. Each call fans out
  // PSI + Anthropic in parallel internally, so concurrency is multiplicative
  // — keep it modest to stay under the runner's 300 s budget.
  for (let i = 0; i < work.length; i += SCORE_CONCURRENCY) {
    if (await isAuditCancelled(supabase, auditId)) return;

    const batch = work.slice(i, i + SCORE_CONCURRENCY);
    const scored = await Promise.all(
      batch.map(async ({ url, html }) => {
        const result = await scoreAndAnalyzePage({ url, html });
        return { url, html, ...result };
      }),
    );

    // Persist sequentially so pages_crawled increments monotonically and
    // the live UI never moves backwards.
    for (const s of scored) {
      const excludePage = detectLikelyPasswordGate(s.html);
      const effectiveScore =
        overallPageScoreFromChecks(s.seoChecks, s.geoChecks) ?? s.score;
      const insertOne = await supabase
        .from("audit_pages")
        .insert({
          audit_id: auditId,
          url: s.url,
          score: effectiveScore,
          seo_results: s.seoChecks,
          geo_results: s.geoChecks,
          fixes: s.fixes,
          ai_comment: s.aiComment,
          exclude_from_audit_score: excludePage,
          sitemap_category_label: categoryByUrl.get(s.url) ?? null,
        })
        .select("id")
        .single();
      if (insertOne.error || !insertOne.data) {
        throw new Error(
          insertOne.error?.message ?? "Failed to insert audit page",
        );
      }
      pagesCrawled += 1;

      // Same accumulation rules as recalculateAuditRollupScores so the
      // running aggregate matches the canonical pass at end of run.
      if (!excludePage) {
        const seo = categoryScoreEffective(s.seoChecks);
        const geo = categoryScoreEffective(s.geoChecks);
        const total = overallPageScoreFromChecks(s.seoChecks, s.geoChecks);
        if (seo != null) {
          seoSum += seo;
          seoN += 1;
        }
        if (geo != null) {
          geoSum += geo;
          geoN += 1;
        }
        if (total != null) {
          totalSum += total;
          totalN += 1;
        }
      }
    }

    await supabase
      .from("audits")
      .update({
        pages_crawled: pagesCrawled,
        seo_score: avg(seoSum, seoN),
        geo_score: avg(geoSum, geoN),
        score: avg(totalSum, totalN),
      })
      .eq("id", auditId);
  }

  if (await isAuditCancelled(supabase, auditId)) return;

  // Final canonical recompute. This single read closes any drift between
  // the in-memory aggregate and the persisted rows (e.g. if a user edits
  // exclude_from_audit_score on an individual page concurrently).
  await recalculateAuditRollupScores(supabase, auditId);

  // If every fetch failed, pagesCrawled === 0 with urls.length > 0 — finish
  // cleanly with progress_total: 0 so the UI does not show "0 / N complete".
  const finalProgressTotal = pagesCrawled === 0 ? 0 : urls.length;

  const finalUpdate = await supabase
    .from("audits")
    .update({
      status: "complete",
      pages_crawled: pagesCrawled,
      progress_total: finalProgressTotal,
      near_duplicate_checks: [],
    })
    .eq("id", auditId);

  if (finalUpdate.error) {
    throw new Error(finalUpdate.error.message);
  }
}

/**
 * Mark an audit failed and clear the progress denominator so the UI stops
 * showing a partial fraction. Preserves any `pages_crawled` value already
 * persisted so triage can see how far the run got.
 */
export async function markAuditFailed(
  supabase: SupabaseClient,
  auditId: string,
): Promise<void> {
  await supabase
    .from("audits")
    .update({ status: "failed", progress_total: null })
    .eq("id", auditId);
}
