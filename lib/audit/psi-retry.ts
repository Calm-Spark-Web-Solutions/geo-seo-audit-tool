/**
 * Post-scan Lighthouse top-up.
 *
 * After a Visibility Scan finishes, some `audit_pages` rows may have no
 * Lighthouse / PageSpeed Insights data because PSI timed out, returned
 * 429/503, or otherwise short-circuited. This module finds those rows and
 * runs `refreshAuditPagePsi` against each — same code path as the per-page
 * manual "Run PageSpeed again" button, so scoring + rollup recompute stay
 * consistent.
 *
 * Caller contract:
 *   - `runAudit` (lib/audit/run.ts) kicks `/api/visibility-scans/[id]/psi-drain`
 *     after `status = complete` for chained background top-up.
 *   - The bulk endpoint at `/api/visibility-scans/[id]/psi-retry` calls
 *     `retryMissingPsiForAudit` from a user click; rate limiting lives at the
 *     HTTP boundary (not here).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { hasPsiCategories } from "@/lib/audit/psi-keys";
import { refreshAuditPagePsi } from "@/lib/audit/refresh-audit-page";
import { observabilityLog } from "@/lib/observability/log";
import type { AuditCheck } from "@/types";

/**
 * Hard upper bound on pages we'll try in a single pass.
 *
 * PSI worst-case is ~45 s per request (`PSI_TIMEOUT_MS` in psi.ts). The
 * bulk retry route has a 300 s Vercel budget. At cap=6 with 1.5 s spacing:
 *   worst case: 6 × 45 s + 5 × 1.5 s = 277.5 s — safely under budget.
 * Pages beyond the cap stay visible in the "missing Lighthouse" UI; a
 * second button click handles them.
 */
export const MAX_INLINE_RETRIES = 6;

/** Max chained drain invocations (6 pages × 15 ≈ 90 page attempts). */
export const MAX_DRAIN_PASSES = 15;

/**
 * Pause between PSI requests. 1.5 s gives Google's per-key rate limiter
 * enough breathing room on back-to-back retries (the initial audit already
 * consumed quota for these pages).
 */
export const RETRY_SPACING_MS = 1500;

export interface MissingPsiPage {
  pageId: string;
  url: string;
}

export interface RetryMissingPsiOptions {
  /** Override `MAX_INLINE_RETRIES` (e.g. tests). */
  maxRetries?: number;
  /** Override `RETRY_SPACING_MS` (e.g. tests). */
  spacingMs?: number;
}

export interface RetryMissingPsiResult {
  /** Number of pages we tried to refresh. */
  attempted: number;
  /** Pages that now have Lighthouse data after the pass. */
  recovered: number;
  /** Pages that were missing PSI and still are after the pass. */
  stillMissing: number;
  /** Pages we never attempted (e.g. PSI unconfigured or exceeded the cap). */
  skipped: number;
}

export interface PsiDrainPassResult extends RetryMissingPsiResult {
  /** Pages still missing Lighthouse after this pass (re-queried). */
  remaining: number;
}

/**
 * Whether the background PSI drain should schedule another pass.
 * Pure helper — covered by unit tests.
 */
export function shouldChainPsiDrain(
  passIndex: number,
  pass: Pick<RetryMissingPsiResult, "attempted" | "recovered">,
  remaining: number,
): boolean {
  if (remaining === 0) return false;
  if (passIndex >= MAX_DRAIN_PASSES - 1) return false;
  if (pass.attempted === 0) return false;
  if (pass.attempted > 0 && pass.recovered === 0) return false;
  return true;
}

/**
 * Scan `audit_pages` for the given audit and return the rows whose stored
 * check arrays carry none of the four Lighthouse category keys. Matches
 * the empty-state predicate in `components/audits/LighthouseSection.tsx`.
 */
export async function findPagesMissingPsi(
  supabase: SupabaseClient,
  auditId: string,
): Promise<MissingPsiPage[]> {
  const { data, error } = await supabase
    .from("audit_pages")
    .select("id, url, seo_results, geo_results")
    .eq("audit_id", auditId);

  if (error || !data) return [];

  const missing: MissingPsiPage[] = [];
  for (const row of data as {
    id: string;
    url: string;
    seo_results: unknown;
    geo_results: unknown;
  }[]) {
    const seo = (row.seo_results as AuditCheck[] | null) ?? [];
    const geo = (row.geo_results as AuditCheck[] | null) ?? [];
    if (!hasPsiCategories([...seo, ...geo])) {
      missing.push({ pageId: row.id, url: row.url });
    }
  }
  return missing;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * One best-effort PSI top-up pass over an audit's missing-Lighthouse pages.
 *
 * Behavior:
 *   - Caps at `maxRetries` pages per call (defaults to `MAX_INLINE_RETRIES`).
 *   - Sleeps `spacingMs` between requests.
 *   - Each page failure is swallowed and logged via `observabilityLog`;
 *     one bad page never blocks the rest.
 *   - Exits early with `attempted: 0` when `PSI_API_KEY` is unset — no
 *     point in attempting requests we know will short-circuit.
 */
export async function retryMissingPsiForAudit(
  supabase: SupabaseClient,
  auditId: string,
  opts: RetryMissingPsiOptions = {},
): Promise<RetryMissingPsiResult> {
  const cap = Math.max(0, opts.maxRetries ?? MAX_INLINE_RETRIES);
  const spacing = opts.spacingMs ?? RETRY_SPACING_MS;

  const missing = await findPagesMissingPsi(supabase, auditId);
  if (missing.length === 0) {
    return { attempted: 0, recovered: 0, stillMissing: 0, skipped: 0 };
  }

  if (!process.env.PSI_API_KEY?.trim()) {
    observabilityLog.warn("psi_retry.skipped_no_key", {
      audit_id: auditId,
      missing: missing.length,
    });
    return {
      attempted: 0,
      recovered: 0,
      stillMissing: missing.length,
      skipped: missing.length,
    };
  }

  const target = missing.slice(0, cap);
  const skipped = missing.length - target.length;
  let attempted = 0;
  let recovered = 0;

  for (let i = 0; i < target.length; i += 1) {
    const page = target[i]!;
    if (i > 0) await sleep(spacing);
    attempted += 1;

    try {
      const result = await refreshAuditPagePsi(
        supabase,
        auditId,
        page.pageId,
      );
      if (result.ok) {
        recovered += 1;
      } else {
        observabilityLog.warn("psi_retry.page_failed", {
          audit_id: auditId,
          page_id: page.pageId,
          url: page.url,
          code: result.code,
          message: result.message,
        });
        // If we know PSI is unconfigured, every subsequent call will hit
        // the same gate — bail out to save time.
        if (result.code === "no_psi_key") break;
      }
    } catch (err) {
      observabilityLog.error("psi_retry.page_threw", {
        audit_id: auditId,
        page_id: page.pageId,
        url: page.url,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const stillMissing = missing.length - recovered;

  observabilityLog.info("psi_retry.pass_complete", {
    audit_id: auditId,
    attempted,
    recovered,
    still_missing: stillMissing,
    skipped,
  });

  return {
    attempted,
    recovered,
    stillMissing,
    skipped,
  };
}

/**
 * One drain-route pass: run a capped retry batch, then re-count missing pages.
 */
export async function runPsiDrainPass(
  supabase: SupabaseClient,
  auditId: string,
  opts: RetryMissingPsiOptions = {},
): Promise<PsiDrainPassResult> {
  const result = await retryMissingPsiForAudit(supabase, auditId, opts);
  const remainingList = await findPagesMissingPsi(supabase, auditId);
  return {
    ...result,
    remaining: remainingList.length,
    stillMissing: remainingList.length,
  };
}
