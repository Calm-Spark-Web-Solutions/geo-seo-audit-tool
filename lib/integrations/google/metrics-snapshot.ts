import type { SupabaseClient } from "@supabase/supabase-js";

import { observabilityLog } from "@/lib/observability/log";
import {
  friendlyGa4ApiError,
  friendlyGscApiError,
} from "@/lib/integrations/google/google-properties-ui";

import {
  getCompanyIdForCommunity,
  getGoogleAccessTokenForCompany,
  loadCommunityGoogleProperties,
} from "./connection";
import type { GoogleMetricsSnapshot } from "./field-checks";
import { fetchGsc28DayTotals } from "./gsc";
import { fetchGa4_28DayTotals } from "./ga4";

export type MetricsSnapshotSource = "audit" | "daily_sync";

export type GoogleMetricsSyncResult =
  | { ok: true; metrics: GoogleMetricsSnapshot; warnings: string[] }
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
  let gscOk = !hasGsc;
  let ga4Ok = !hasGa4;

  if (hasGsc && props?.gsc_site_url) {
    try {
      const gsc = await fetchGsc28DayTotals(accessToken, props.gsc_site_url);
      metrics.gsc_clicks_28d = gsc.clicks;
      metrics.gsc_impressions_28d = gsc.impressions;
      gscOk = true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      observabilityLog.warn("google.metrics_gsc_failed", { communityId, error: raw });
      warnings.push(`Search Console: ${friendlyGscApiError(raw)}`);
    }
  }

  if (hasGa4 && props?.ga4_property_id) {
    try {
      const ga4 = await fetchGa4_28DayTotals(accessToken, props.ga4_property_id);
      metrics.ga4_sessions_28d = ga4.sessions;
      metrics.ga4_active_users_28d = ga4.activeUsers;
      ga4Ok = true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      observabilityLog.warn("google.metrics_ga4_failed", { communityId, error: raw });
      warnings.push(`Analytics: ${friendlyGa4ApiError(raw)}`);
    }
  }

  if (!gscOk && !ga4Ok) {
    return {
      ok: false,
      error: warnings.join(" · ") || "Could not fetch Google metrics.",
    };
  }

  return { ok: true, metrics, warnings };
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function upsertCommunityGoogleMetricsSnapshot(
  supabase: SupabaseClient,
  opts: {
    communityId: string;
    metrics: GoogleMetricsSnapshot;
    source: MetricsSnapshotSource;
    auditId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const snapshotDate = todayUtcDate();
  const { error } = await supabase.from("community_google_metrics_snapshots").upsert(
    {
      community_id: opts.communityId,
      snapshot_date: snapshotDate,
      gsc_clicks_28d: opts.metrics.gsc_clicks_28d,
      gsc_impressions_28d: opts.metrics.gsc_impressions_28d,
      ga4_sessions_28d: opts.metrics.ga4_sessions_28d,
      ga4_active_users_28d: opts.metrics.ga4_active_users_28d,
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
