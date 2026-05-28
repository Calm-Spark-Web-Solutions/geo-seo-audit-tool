import type { SupabaseClient } from "@supabase/supabase-js";

import { devRunnerConsole } from "@/lib/audit/dev-runner-console";
import { observabilityLog } from "@/lib/observability/log";
import type { AuditCheck } from "@/types";
import { crawlSite } from "@/lib/crawler/crawl";
import {
  fetchAllHtmlForAudit,
  PAGE_FETCH_TIMEOUT_MS,
} from "@/lib/crawler/fetch-pages";
import {
  DEFAULT_USER_AGENT,
  isAssetUrl,
  normalizeUrl,
  sameAuditSiteOrigin,
} from "@/lib/crawler/normalize";
import {
  buildUrlToSitemapCategoryLabelMap,
  fetchSitemap,
  fetchUrlsFromShards,
} from "@/lib/crawler/sitemap";
import { sortLegalUrlsLast } from "@/lib/crawler/url-scan-order";
import { kickPsiDrainFireAndForget } from "@/lib/audit/runner-kick";
import { recalculateAuditRollupScores } from "@/lib/audit/rollup-scores";
import { recordRosterEntries } from "@/lib/billing/page-quota";
import {
  categoryScoreEffective,
  overallPageScoreFromChecks,
} from "@/lib/scoring/effective-scores";
import { scoreAndAnalyzePage } from "@/lib/scoring";
import { runCruxOriginChecks } from "@/lib/scoring/crux";
import { detectLikelyPasswordGate } from "@/lib/scoring/password-gate";
import { buildCrawlGraphChecks } from "@/lib/scoring/crawl-graph";
import { buildNearDuplicateChecks } from "@/lib/scoring/near-duplicate";
import { runGoogleFieldChecks } from "@/lib/integrations/google/field-checks";
import { syncGoogleMetricsForCommunity } from "@/lib/integrations/google/metrics-snapshot";
import { buildAnalyticsSiteWideChecks } from "@/lib/scoring/analytics-tags";
import { runSiteWideChecks } from "@/lib/scoring/site-wide";

/**
 * Cap used for audits inserted before Phase 11 (audit category selection),
 * which did not persist a per-audit `max_pages`. Older runs continue to
 * behave exactly as they used to.
 */
const LEGACY_MAX_PAGES = 10;
const HARD_PAGE_CEILING = 1000;
// Raised from 3 → 5 now that per-position PSI stagger is removed. The PSI
// scorer handles 429s with retry/back-off, so pre-emptive serialisation is
// no longer needed. 5 concurrent pages = ~40 % more scoring throughput.
const SCORE_CONCURRENCY = 5;
const ENGINE_VERSION = 4;

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

/** Postgres `text[]` should deserialize as a string array; guard malformed JSON/types. */
function coerceAuditTextArray(
  auditId: string,
  field: "shard_urls" | "target_urls",
  raw: unknown,
): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    observabilityLog.warn(
      field === "shard_urls"
        ? "audit.run.malformed_shard_urls"
        : "audit.run.malformed_target_urls",
      { auditId },
    );
    return null;
  }
  return raw.filter((u): u is string => typeof u === "string");
}

/**
 * Defensive normalize for an explicit URL allowlist persisted on the audit
 * row. Even though the action validated, we re-apply same-site checks (including
 * apex vs www), asset filters, and dedupe so a tampered DB row can never fan out
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
    if (!sameAuditSiteOrigin(base, normalized)) continue;
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
    if (normalized.length > 0) return sortLegalUrlsLast(normalized);
    // Fall through to shard / sitemap if every target URL was filtered out
    // (e.g. all were foreign-origin in a tampered row).
  }

  if (shardUrls && shardUrls.length > 0) {
    const list = await fetchUrlsFromShards(shardUrls, base, {
      maxPages,
      timeoutMs: PAGE_FETCH_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
    });
    return sortLegalUrlsLast(list);
  }

  const fromSitemap = await fetchSitemap(base, {
    maxPages,
    timeoutMs: PAGE_FETCH_TIMEOUT_MS,
    userAgent: DEFAULT_USER_AGENT,
  });
  if (fromSitemap.length > 0) return sortLegalUrlsLast(fromSitemap);

  const crawled = await crawlSite(base, {
    maxPages,
    timeoutMs: PAGE_FETCH_TIMEOUT_MS,
    userAgent: DEFAULT_USER_AGENT,
  });
  return sortLegalUrlsLast(crawled);
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
  const t0 = Date.now();
  const base = normalizeUrl(websiteUrl);
  if (!base) {
    observabilityLog.error("audit.run.invalid_origin", {
      auditId,
      websiteUrl,
    });
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

  observabilityLog.info("audit.run.start", {
    auditId,
    origin: base,
    psiEnabled: Boolean(process.env.PSI_API_KEY?.trim()),
    anthropicEnabled: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  });
  devRunnerConsole("runAudit: start", { auditId, origin: base });

  // Read the user's selection (may be null for legacy audit rows). Then
  // mark the audit `running` so the live UI flips out of `pending`.
  const { data: auditRow } = await supabase
    .from("audits")
    .select("max_pages, shard_urls, target_urls, status, community_id")
    .eq("id", auditId)
    .maybeSingle();

  const communityId =
    (auditRow?.community_id as string | null | undefined) ?? null;

  if (auditRow?.status === "cancelled") {
    return;
  }

  const maxPages = clampPageCap(
    (auditRow?.max_pages as number | null | undefined) ?? null,
  );
  const shardUrls = coerceAuditTextArray(
    auditId,
    "shard_urls",
    auditRow?.shard_urls,
  );
  const targetUrls = coerceAuditTextArray(
    auditId,
    "target_urls",
    auditRow?.target_urls,
  );

  await supabase
    .from("audits")
    .update({
      status: "running",
      engine_version: ENGINE_VERSION,
      fetch_failures: null,
    })
    .eq("id", auditId);

  devRunnerConsole("runAudit: audits.status -> running", { auditId });

  // Run site-wide probes and URL discovery in parallel — they all only need
  // `base` and the audit-row fields already in scope, so there is no data
  // dependency between them. Previously these ran sequentially, costing
  // the sum of their latencies (robots fetch + CrUX API + sitemap walk).
  const tStartup = Date.now();
  devRunnerConsole("runAudit: startup parallel (siteWide + crux + resolveUrls)", {
    auditId,
    maxPages,
    hasTargetUrls: Boolean(targetUrls?.length),
    hasShardUrls: Boolean(shardUrls?.length),
  });
  const googleChecksPromise =
    communityId != null
      ? runGoogleFieldChecks(supabase, communityId).catch(() => ({
          checks: [] as AuditCheck[],
          metrics: null,
        }))
      : Promise.resolve({ checks: [] as AuditCheck[], metrics: null });

  const [siteWideChecksRaw, cruxFieldChecksRaw, urls, googleFieldResult] =
    await Promise.all([
      runSiteWideChecks(base).catch((): AuditCheck[] => []),
      runCruxOriginChecks(base).catch((): AuditCheck[] => []),
      resolveUrls(base, maxPages, shardUrls, targetUrls),
      googleChecksPromise,
    ]);
  let siteWideChecks: AuditCheck[] = siteWideChecksRaw;
  const cruxFieldChecks: AuditCheck[] = cruxFieldChecksRaw;
  const googleFieldChecks: AuditCheck[] = googleFieldResult.checks;
  devRunnerConsole("runAudit: startup parallel done", {
    auditId,
    urlCount: urls.length,
    durationMs: Date.now() - tStartup,
  });

  observabilityLog.info("audit.urls_resolved", {
    auditId,
    urlCount: urls.length,
    durationMs: Date.now() - t0,
  });

  // Write site-wide checks, CrUX results, and progress_total in a single
  // round-trip (previously two separate awaited writes).
  await supabase
    .from("audits")
    .update({
      site_wide_checks: siteWideChecks,
      crux_field_checks: cruxFieldChecks,
      google_field_checks: googleFieldChecks,
      progress_total: urls.length,
    })
    .eq("id", auditId);

  devRunnerConsole("runAudit: progress_total set", {
    auditId,
    progressTotal: urls.length,
  });

  if (urls.length === 0) {
    observabilityLog.warn("audit.run.no_urls", {
      auditId,
      durationMs: Date.now() - t0,
    });
    devRunnerConsole("runAudit: no_urls (resolveUrls returned empty)", {
      auditId,
      durationMs: Date.now() - t0,
    });
    await supabase
      .from("audits")
      .update({
        status: "complete",
        pages_crawled: 0,
        progress_total: 0,
        score: null,
        seo_score: null,
        geo_score: null,
        near_duplicate_checks: [],   // no pages fetched yet
      })
      .eq("id", auditId);
    return;
  }

  if (await isAuditCancelled(supabase, auditId)) return;

  // Fetch page HTML and build the sitemap category map in parallel — both
  // only need the resolved URL list and are otherwise independent. Previously
  // the category map was awaited before fetching any HTML, adding a full
  // sitemap round-trip to the critical path on every shard-based audit.
  const [{ work, failures: fetchFailures, salvageRecovered }, categoryByUrl] =
    await Promise.all([
    fetchAllHtmlForAudit(urls),
    shardUrls && shardUrls.length > 0
      ? buildUrlToSitemapCategoryLabelMap(
          shardUrls,
          base,
          { timeoutMs: PAGE_FETCH_TIMEOUT_MS, userAgent: DEFAULT_USER_AGENT },
          new Set(urls),
        )
      : Promise.resolve(new Map<string, string>()),
  ]);

  if (fetchFailures.length > 0 || salvageRecovered > 0) {
    if (fetchFailures.length > 0) {
      await supabase
        .from("audits")
        .update({ fetch_failures: fetchFailures })
        .eq("id", auditId);
    }
    observabilityLog.warn("audit.run.partial_fetch", {
      auditId,
      planned: urls.length,
      fetched: work.length,
      failed: fetchFailures.length,
      salvageRecovered,
    });
    devRunnerConsole("runAudit: fetch_phase_done", {
      auditId,
      planned: urls.length,
      fetched: work.length,
      failed: fetchFailures.length,
      salvageRecovered,
    });
  }

  if (urls.length > 0 && work.length === 0) {
    observabilityLog.warn("audit.run.all_fetch_failed", {
      auditId,
      urlCount: urls.length,
      durationMs: Date.now() - t0,
    });
    devRunnerConsole("runAudit: all_fetch_failed (every page HTML fetch returned null)", {
      auditId,
      urlCount: urls.length,
      durationMs: Date.now() - t0,
      hint: "See prior [audit-runner] fetchPageWithMeta failed lines for reasons",
    });
    // Throw so finalizeErrored stores the reason in audit_jobs.last_error and
    // the queue can retry. Common causes: bot-blocking (403/non-HTML response),
    // DNS failure, or the site being temporarily unreachable.
    throw new Error(
      `All ${urls.length} page fetch(es) failed — the site may be blocking automated crawlers, ` +
      `is temporarily unavailable, or is returning non-HTML responses (e.g. a bot-challenge page). ` +
      `Check that the community website URL is correct and publicly accessible, then retry.`,
    );
  }

  const crawlGraphChecks = buildCrawlGraphChecks(work, base);
  const analyticsSiteChecks = buildAnalyticsSiteWideChecks(
    work.map((w) => ({ url: w.url, html: w.html })),
  );
  siteWideChecks = [...siteWideChecks, ...crawlGraphChecks, ...analyticsSiteChecks];
  const nearDuplicateChecks = buildNearDuplicateChecks(work);
  await supabase
    .from("audits")
    .update({ site_wide_checks: siteWideChecks, near_duplicate_checks: nearDuplicateChecks })
    .eq("id", auditId);

  let pagesCrawled = 0;
  // Collect roster URLs across all batches; written in a single upsert at
  // the end instead of one DB call per page (was N round-trips → 1).
  const rosterUrls: string[] = [];

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
      batch.map(async ({ url, html, meta }) => {
        // No artificial stagger — if Google rate-limits us (429) the PSI
        // scorer already handles it with retry/back-off. Pre-emptive per-
        // position delays added ~1.5–4.5 s of wasted wall time per batch.
        const result = await scoreAndAnalyzePage({
          url,
          html,
          fetchMeta: meta,
        });
        return { url, html, ...result };
      }),
    );

    // Persist all pages in this batch in parallel, then accumulate scores.
    // pages_crawled is still updated once per batch (below) so the live UI
    // counter moves forward monotonically — parallelising inserts within a
    // batch does not affect that invariant.
    type PersistResult = {
      url: string;
      excludePage: boolean;
      seoChecks: typeof scored[0]["seoChecks"];
      geoChecks: typeof scored[0]["geoChecks"];
    };

    const persistResults = await Promise.all(
      scored.map(async (s): Promise<PersistResult> => {
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

        return { url: s.url, excludePage, seoChecks: s.seoChecks, geoChecks: s.geoChecks };
      }),
    );

    // Accumulate rolling averages and collect URLs for the deferred roster write.
    for (const { url, excludePage, seoChecks, geoChecks } of persistResults) {
      pagesCrawled += 1;
      rosterUrls.push(url);
      if (!excludePage) {
        const seo = categoryScoreEffective(seoChecks);
        const geo = categoryScoreEffective(geoChecks);
        const total = overallPageScoreFromChecks(seoChecks, geoChecks);
        if (seo != null) { seoSum += seo; seoN += 1; }
        if (geo != null) { geoSum += geo; geoN += 1; }
        if (total != null) { totalSum += total; totalN += 1; }
      }
    }

    // Fire-and-forget: this is a live-UI progress indicator, not critical-
    // path data. Not awaiting it lets scoring of the next batch start
    // immediately instead of blocking on a Supabase round-trip (~20–50 ms)
    // after every SCORE_CONCURRENCY pages. The final status:"complete"
    // update is still awaited and is the authoritative write.
    void supabase
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

  // Single batched roster upsert — replaces N per-page calls with one.
  // recordRosterEntries is idempotent (unique on community_id+url).
  if (communityId && rosterUrls.length > 0) {
    try {
      await recordRosterEntries(supabase, {
        communityId,
        auditId,
        urls: rosterUrls,
      });
    } catch (err) {
      observabilityLog.warn("audit.roster_persist_failed", {
        auditId,
        communityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Final canonical recompute. This single read closes any drift between
  // the in-memory aggregate and the persisted rows (e.g. if a user edits
  // exclude_from_audit_score on an individual page concurrently).
  await recalculateAuditRollupScores(supabase, auditId);

  // If every fetch failed, pagesCrawled === 0 with urls.length > 0 — finish
  // cleanly with progress_total: 0 so the UI does not show "0 / N complete".
  const finalProgressTotal = pagesCrawled === 0 ? 0 : urls.length;

  let googleMetrics = googleFieldResult.metrics;
  if (communityId) {
    try {
      const synced = await syncGoogleMetricsForCommunity(
        supabase,
        communityId,
        "audit",
        auditId,
      );
      if (synced) googleMetrics = synced;
    } catch (err) {
      observabilityLog.warn("audit.google_metrics_sync_failed", {
        auditId,
        communityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const finalUpdate = await supabase
    .from("audits")
    .update({
      status: "complete",
      pages_crawled: pagesCrawled,
      progress_total: finalProgressTotal,
      near_duplicate_checks: nearDuplicateChecks,
      fetch_failures: fetchFailures.length > 0 ? fetchFailures : null,
      google_metrics: googleMetrics,
    })
    .eq("id", auditId);

  if (finalUpdate.error) {
    throw new Error(finalUpdate.error.message);
  }

  observabilityLog.info("audit.run.complete", {
    auditId,
    pagesCrawled,
    durationMs: Date.now() - t0,
  });

  // Chained Lighthouse backfill runs in separate `/psi-drain` invocations so
  // the main run stays within its serverless budget. Kick only when PSI is
  // configured; failures are logged inside the drain route.
  if (process.env.PSI_API_KEY?.trim()) {
    kickPsiDrainFireAndForget(auditId);
    observabilityLog.info("audit.run.psi_drain_kicked", { auditId });
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
