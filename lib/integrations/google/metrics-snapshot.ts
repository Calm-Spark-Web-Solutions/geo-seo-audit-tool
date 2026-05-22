import type { SupabaseClient } from "@supabase/supabase-js";

import { observabilityLog } from "@/lib/observability/log";
import {
  friendlyGa4ApiError,
  friendlyGscApiError,
} from "@/lib/integrations/google/google-properties-ui";
import type { GaAiReferral, GscPageRow, GscQueryRow } from "@/types";

import {
  getCompanyIdForCommunity,
  getGoogleAccessTokenForCompany,
  loadCommunityGoogleProperties,
} from "./connection";
import type { GoogleMetricsSnapshot } from "./field-checks";
import { fetchGsc28DayBreakdowns, fetchGsc28DayTotals } from "./gsc";
import { fetchGa4_28DayTotals, fetchGa4AiReferrals } from "./ga4";

export type MetricsSnapshotSource = "audit" | "daily_sync";

/**
 * Per-snapshot detail rows persisted as JSONB on
 * `community_google_metrics_snapshots`. Fields are optional individually so
 * we never block the row upsert when one Google API fails.
 */
export interface GoogleMetricsDetails {
  gsc_top_queries?: GscQueryRow[];
  gsc_top_pages?: GscPageRow[];
  ga4_ai_referrals?: GaAiReferral[];
}

export type GoogleMetricsSyncResult =
  | {
      ok: true;
      metrics: GoogleMetricsSnapshot;
      details: GoogleMetricsDetails;
      warnings: string[];
    }
  | { ok: false; error: string };

export async function fetchGoogleMetricsForCommunity(
  supabase: SupabaseClient,
  communityId: string,
): Promise<GoogleMetricsSyncResult> {
  const companyId = await getCompanyIdForCommunity(supabase, communityId);
  if (!companyId) {
    return { ok: false, error: "Community not found." };
  }

  const accessToken = await getGoogleAccessTokenForCompany(supabase, companyId);
  if (!accessToken) {
    return {
      ok: false,
      error:
        "Google is not connected or the access token could not be refreshed. Reconnect in organization settings.",
    };
  }

  const props = await loadCommunityGoogleProperties(supabase, communityId);
  const hasGsc = Boolean(props?.gsc_site_url?.trim());
  const hasGa4 = Boolean(props?.ga4_property_id?.trim());
  if (!hasGsc && !hasGa4) {
    return {
      ok: false,
      error: "Map Search Console and/or GA4 properties for this community first.",
    };
  }

  const metrics: GoogleMetricsSnapshot = {
    gsc_clicks_28d: 0,
    gsc_impressions_28d: 0,
    ga4_sessions_28d: 0,
    ga4_active_users_28d: 0,
  };

  const warnings: string[] = [];
  const details: GoogleMetricsDetails = {};
  let gscOk = !hasGsc;
  let ga4Ok = !hasGa4;

  // GSC totals + dimensional breakdowns run in parallel against the same
  // `searchAnalytics/query` endpoint. A breakdown failure does not invalidate
  // the totals (and vice versa) — each is best-effort.
  if (hasGsc && props?.gsc_site_url) {
    const siteUrl = props.gsc_site_url;
    const [totalsResult, breakdownsResult] = await Promise.allSettled([
      fetchGsc28DayTotals(accessToken, siteUrl),
      fetchGsc28DayBreakdowns(accessToken, siteUrl),
    ]);

    if (totalsResult.status === "fulfilled") {
      metrics.gsc_clicks_28d = totalsResult.value.clicks;
      metrics.gsc_impressions_28d = totalsResult.value.impressions;
      gscOk = true;
    } else {
      const raw =
        totalsResult.reason instanceof Error
          ? totalsResult.reason.message
          : String(totalsResult.reason);
      observabilityLog.warn("google.metrics_gsc_failed", { communityId, error: raw });
      warnings.push(`Search Console: ${friendlyGscApiError(raw)}`);
    }

    if (breakdownsResult.status === "fulfilled") {
      details.gsc_top_queries = breakdownsResult.value.topQueries;
      details.gsc_top_pages = breakdownsResult.value.topPages;
    } else {
      const raw =
        breakdownsResult.reason instanceof Error
          ? breakdownsResult.reason.message
          : String(breakdownsResult.reason);
      observabilityLog.warn("google.metrics_gsc_breakdowns_failed", {
        communityId,
        error: raw,
      });
    }
  }

  if (hasGa4 && props?.ga4_property_id) {
    const propertyId = props.ga4_property_id;
    const [totalsResult, aiReferralsResult] = await Promise.allSettled([
      fetchGa4_28DayTotals(accessToken, propertyId),
      fetchGa4AiReferrals(accessToken, propertyId),
    ]);

    if (totalsResult.status === "fulfilled") {
      metrics.ga4_sessions_28d = totalsResult.value.sessions;
      metrics.ga4_active_users_28d = totalsResult.value.activeUsers;
      ga4Ok = true;
    } else {
      const raw =
        totalsResult.reason instanceof Error
          ? totalsResult.reason.message
          : String(totalsResult.reason);
      observabilityLog.warn("google.metrics_ga4_failed", { communityId, error: raw });
      warnings.push(`Analytics: ${friendlyGa4ApiError(raw)}`);
    }

    if (aiReferralsResult.status === "fulfilled") {
      details.ga4_ai_referrals = aiReferralsResult.value;
    } else {
      const raw =
        aiReferralsResult.reason instanceof Error
          ? aiReferralsResult.reason.message
          : String(aiReferralsResult.reason);
      observabilityLog.warn("google.metrics_ga4_ai_referrals_failed", {
        communityId,
        error: raw,
      });
    }
  }

  if (!gscOk && !ga4Ok) {
    return {
      ok: false,
      error: warnings.join(" · ") || "Could not fetch Google metrics.",
    };
  }

  return { ok: true, metrics, details, warnings };
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function upsertCommunityGoogleMetricsSnapshot(
  supabase: SupabaseClient,
  opts: {
    communityId: string;
    metrics: GoogleMetricsSnapshot;
    details?: GoogleMetricsDetails;
    source: MetricsSnapshotSource;
    auditId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const snapshotDate = todayUtcDate();
  const details = opts.details ?? {};
  const { error } = await supabase.from("community_google_metrics_snapshots").upsert(
    {
      community_id: opts.communityId,
      snapshot_date: snapshotDate,
      gsc_clicks_28d: opts.metrics.gsc_clicks_28d,
      gsc_impressions_28d: opts.metrics.gsc_impressions_28d,
      ga4_sessions_28d: opts.metrics.ga4_sessions_28d,
      ga4_active_users_28d: opts.metrics.ga4_active_users_28d,
      gsc_top_queries: details.gsc_top_queries ?? null,
      gsc_top_pages: details.gsc_top_pages ?? null,
      ga4_ai_referrals: details.ga4_ai_referrals ?? null,
      source: opts.source,
      audit_id: opts.auditId ?? null,
    },
    { onConflict: "community_id,snapshot_date" },
  );
  if (error) {
    observabilityLog.warn("google.metrics_snapshot_upsert_failed", {
      communityId: opts.communityId,
      error: error.message,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function syncGoogleMetricsForCommunityDetailed(
  supabase: SupabaseClient,
  communityId: string,
  source: MetricsSnapshotSource,
  auditId?: string | null,
): Promise<GoogleMetricsSyncResult> {
  const fetched = await fetchGoogleMetricsForCommunity(supabase, communityId);
  if (!fetched.ok) return fetched;

  const upserted = await upsertCommunityGoogleMetricsSnapshot(supabase, {
    communityId,
    metrics: fetched.metrics,
    details: fetched.details,
    source,
    auditId,
  });
  if (!upserted.ok) {
    return {
      ok: false,
      error: `Metrics fetched but could not save snapshot: ${upserted.error}`,
    };
  }

  return fetched;
}

/** Back-compat for audit runner and cron. */
export async function syncGoogleMetricsForCommunity(
  supabase: SupabaseClient,
  communityId: string,
  source: MetricsSnapshotSource,
  auditId?: string | null,
): Promise<GoogleMetricsSnapshot | null> {
  const result = await syncGoogleMetricsForCommunityDetailed(
    supabase,
    communityId,
    source,
    auditId,
  );
  return result.ok ? result.metrics : null;
}

/** Daily cron: refresh snapshots for communities with property mapping. */
export async function syncAllCommunityGoogleMetrics(
  supabase: SupabaseClient,
): Promise<{ synced: number; failed: number }> {
  const { data: rows } = await supabase
    .from("community_google_properties")
    .select("community_id, gsc_site_url, ga4_property_id")
    .or("gsc_site_url.not.is.null,ga4_property_id.not.is.null");

  let synced = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const id = row.community_id as string;
    try {
      const result = await syncGoogleMetricsForCommunityDetailed(
        supabase,
        id,
        "daily_sync",
      );
      if (result.ok) synced += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
}
