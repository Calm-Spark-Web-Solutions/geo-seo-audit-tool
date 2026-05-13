/**
 * Page-roster billing helpers.
 *
 * The roster (table: `community_page_roster`) is the source of truth for
 * "URLs this community is currently paying to track". A URL goes on the
 * roster the first time it is successfully scored in an audit (see
 * `lib/audit/run.ts`). Rescans of already-rostered URLs are always free.
 *
 * Two enforcement points use these helpers:
 *
 *   - `startAudit` (new-visibility-scan/actions.ts) calls
 *     `classifyScanUrls` + `enforceNewPagesAllowance` against the user's
 *     selected URLs before inserting the audits row, so the user sees a
 *     clear error before any AI / PSI spend.
 *   - The runner persists newly-tracked URLs via `recordRosterEntries`
 *     after a successful audit_pages insert.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUrl } from "@/lib/crawler/normalize";
import {
  effectiveMonthlyNewPagesCap,
  type PlanLimits,
} from "@/lib/billing/plan-limits";

/** Canonical form used for both roster rows and audit URL comparisons. */
export function canonicalRosterUrl(input: string): string | null {
  return normalizeUrl(input);
}

export interface ClassifiedScanUrls {
  /** Normalized URLs already in the community roster (rescans — free). */
  tracked: string[];
  /** Normalized URLs not on the roster yet — would count toward new-page caps. */
  newUrls: string[];
  /** Original-input → normalized map. Inputs that failed to normalize map to `null`. */
  normalizedByInput: Record<string, string | null>;
}

/**
 * Compare an arbitrary list of URLs against the existing roster for a
 * community. Inputs that fail normalization (non-http(s), unparsable) are
 * surfaced via `normalizedByInput` so the caller can show a precise error.
 */
export async function classifyScanUrls(
  supabase: SupabaseClient,
  opts: { communityId: string; urls: string[] },
): Promise<ClassifiedScanUrls> {
  const normalizedByInput: Record<string, string | null> = {};
  const normalizedSet = new Set<string>();
  for (const raw of opts.urls) {
    const n = canonicalRosterUrl(raw);
    normalizedByInput[raw] = n;
    if (n) normalizedSet.add(n);
  }

  const normalizedList = [...normalizedSet];
  if (normalizedList.length === 0) {
    return { tracked: [], newUrls: [], normalizedByInput };
  }

  const { data: rosterRows } = await supabase
    .from("community_page_roster")
    .select("url")
    .eq("community_id", opts.communityId)
    .in("url", normalizedList);

  const rosterSet = new Set(
    (rosterRows ?? []).map((r) => r.url as string),
  );

  const tracked: string[] = [];
  const newUrls: string[] = [];
  for (const n of normalizedList) {
    if (rosterSet.has(n)) tracked.push(n);
    else newUrls.push(n);
  }

  return { tracked, newUrls, normalizedByInput };
}

export interface NewPagesAllowance {
  /** Per-community cap on new URLs added in the current UTC month. */
  monthlyNewCap: number | null;
  /** Per-community hard cap on total roster size. */
  rosterCap: number | null;
  /** Roster rows already present for this community. */
  rosterUsed: number;
  /** New URLs already added to the roster this UTC month for this community. */
  newAddedThisMonth: number;
}

function utcMonthWindow(now = new Date()): { start: string; end: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString(),
    end: new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0)).toISOString(),
  };
}

export async function loadNewPagesAllowance(
  supabase: SupabaseClient,
  opts: { communityId: string; limits: PlanLimits },
): Promise<NewPagesAllowance> {
  const { start, end } = utcMonthWindow();

  const [{ count: rosterTotalCount }, { count: monthCount }] = await Promise.all([
    supabase
      .from("community_page_roster")
      .select("id", { count: "exact", head: true })
      .eq("community_id", opts.communityId),
    supabase
      .from("community_page_roster")
      .select("id", { count: "exact", head: true })
      .eq("community_id", opts.communityId)
      .gte("first_seen_at", start)
      .lt("first_seen_at", end),
  ]);

  return {
    // Effective monthly cap = base tier allowance + purchased Page Pack
    // bonus. Both being null/unlimited makes the whole cap unlimited.
    monthlyNewCap: effectiveMonthlyNewPagesCap(opts.limits),
    rosterCap: opts.limits.pagesPerCommunity,
    rosterUsed: rosterTotalCount ?? 0,
    newAddedThisMonth: monthCount ?? 0,
  };
}

export type EnforceNewPagesResult =
  | {
      ok: true;
      /** URLs the caller may actually proceed with (always includes the tracked set). */
      acceptedUrls: string[];
      /** New URLs that the caller chose to add and that fit under both caps. */
      acceptedNewUrls: string[];
      /** New URLs trimmed because the monthly or roster cap was exceeded. */
      trimmedNewUrls: string[];
    }
  | {
      ok: false;
      reason: "monthly_new_pages" | "roster_full" | "nothing_left";
      message: string;
      allowance: NewPagesAllowance;
    };

/**
 * Decide what subset of `classified.newUrls` may join the roster without
 * busting the monthly new-page allowance or the total roster cap. Tracked
 * URLs are always accepted (rescans are free). When enforcement is fully
 * disabled (both caps null) every URL is accepted.
 */
export function enforceNewPagesAllowance(opts: {
  classified: ClassifiedScanUrls;
  allowance: NewPagesAllowance;
}): EnforceNewPagesResult {
  const { tracked, newUrls } = opts.classified;
  const { monthlyNewCap, rosterCap, newAddedThisMonth, rosterUsed } =
    opts.allowance;

  // Unlimited path.
  if (monthlyNewCap === null && rosterCap === null) {
    return {
      ok: true,
      acceptedUrls: [...tracked, ...newUrls],
      acceptedNewUrls: newUrls,
      trimmedNewUrls: [],
    };
  }

  const monthlyRemaining =
    monthlyNewCap === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, monthlyNewCap - newAddedThisMonth);
  const rosterRemaining =
    rosterCap === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, rosterCap - rosterUsed);

  const slots = Math.min(monthlyRemaining, rosterRemaining);

  // No new URLs requested → nothing to enforce, accept all.
  if (newUrls.length === 0) {
    return {
      ok: true,
      acceptedUrls: tracked,
      acceptedNewUrls: [],
      trimmedNewUrls: [],
    };
  }

  if (slots <= 0) {
    const reason: "roster_full" | "monthly_new_pages" =
      rosterRemaining <= 0 ? "roster_full" : "monthly_new_pages";
    const message =
      reason === "roster_full"
        ? `Page roster for this community is full (${rosterCap}/${rosterCap}). Remove a tracked URL or upgrade your plan to add new pages.`
        : `Monthly new-page allowance reached (${monthlyNewCap}/${monthlyNewCap}). New URLs added this month: ${newAddedThisMonth}. Rescans of tracked pages are still free.`;
    return {
      ok: false,
      reason,
      message,
      allowance: opts.allowance,
    };
  }

  const accepted = newUrls.slice(0, slots);
  const trimmed = newUrls.slice(slots);

  return {
    ok: true,
    acceptedUrls: [...tracked, ...accepted],
    acceptedNewUrls: accepted,
    trimmedNewUrls: trimmed,
  };
}

/**
 * Persist new roster rows when the runner successfully scored a URL.
 * `auditId` is recorded as `first_audit_id` for the audit-trail column.
 * Safe to call with rescanned URLs; the unique constraint plus
 * `ignoreDuplicates` makes the call idempotent.
 */
export async function recordRosterEntries(
  supabase: SupabaseClient,
  opts: { communityId: string; auditId: string; urls: string[] },
): Promise<void> {
  if (opts.urls.length === 0) return;
  const rows: { community_id: string; url: string; first_audit_id: string }[] =
    [];
  const seen = new Set<string>();
  for (const raw of opts.urls) {
    const n = canonicalRosterUrl(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    rows.push({
      community_id: opts.communityId,
      url: n,
      first_audit_id: opts.auditId,
    });
  }
  if (rows.length === 0) return;

  await supabase
    .from("community_page_roster")
    .upsert(rows, { onConflict: "community_id,url", ignoreDuplicates: true });
}
