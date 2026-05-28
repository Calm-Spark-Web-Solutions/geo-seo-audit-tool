import type { SupabaseClient } from "@supabase/supabase-js";

import { observabilityLog } from "@/lib/observability/log";
import { scoreFromResult } from "@/lib/scoring/deterministic";
import type { AuditCheck, CheckResult } from "@/types";

import {
  getCompanyIdForCommunity,
  getGoogleAccessTokenForCompany,
  loadCommunityGoogleProperties,
  loadGoogleConnection,
} from "./connection";
import { fetchGsc28DayTotals, listGscSitemaps, listGscSites } from "./gsc";
import { fetchGa4_28DayTotals } from "./ga4";

function googleCheck(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    category: "Google Search Console & GA4",
    pillar: "SEO",
  };
}

export interface GoogleFieldChecksResult {
  checks: AuditCheck[];
  metrics: GoogleMetricsSnapshot | null;
}

export interface GoogleMetricsSnapshot {
  gsc_clicks_28d: number;
  gsc_impressions_28d: number;
  ga4_sessions_28d: number;
  ga4_active_users_28d: number;
}

/**
 * API-backed GSC/GA4 checks when company OAuth + property mapping exist.
 * Degrades to warn rows when not connected.
 */
export async function runGoogleFieldChecks(
  supabase: SupabaseClient,
  communityId: string,
): Promise<GoogleFieldChecksResult> {
  const checks: AuditCheck[] = [];
  let metrics: GoogleMetricsSnapshot | null = null;

  const companyId = await getCompanyIdForCommunity(supabase, communityId);
  if (!companyId) {
    return { checks: notConnectedChecks("Community has no organization."), metrics };
  }

  const connection = await loadGoogleConnection(supabase, companyId);
  const props = await loadCommunityGoogleProperties(supabase, communityId);

  if (!connection) {
    return {
      checks: notConnectedChecks(
        "Connect Google on the Google setup page to enable Search Console and Analytics checks.",
      ),
      metrics,
    };
  }

  const accessToken = await getGoogleAccessTokenForCompany(supabase, companyId);
  if (!accessToken) {
    return {
      checks: [
        googleCheck(
          "google_oauth_token",
          "Google connection",
          "warn",
          "Google is connected but the access token could not be refreshed. Reconnect on the Google setup page.",
        ),
      ],
      metrics,
    };
  }

  const gscMapped = Boolean(props?.gsc_site_url?.trim());
  const ga4Mapped = Boolean(props?.ga4_property_id?.trim());

  checks.push(
    googleCheck(
      "gsc_property_linked",
      "GSC property linked",
      gscMapped ? "pass" : "fail",
      gscMapped
        ? `Search Console property mapped: ${props!.gsc_site_url}.`
        : "No Search Console property selected for this community. Map one on the community edit page.",
    ),
  );

  checks.push(
    googleCheck(
      "ga4_property_linked",
      "GA4 property linked",
      ga4Mapped ? "pass" : "fail",
      ga4Mapped
        ? `GA4 property mapped: ${props!.ga4_property_id}.`
        : "No GA4 property selected for this community. Map one on the community edit page.",
    ),
  );

  if (!gscMapped && !ga4Mapped) {
    return { checks, metrics };
  }

  try {
    if (gscMapped && props?.gsc_site_url) {
      const sites = await listGscSites(accessToken);
      const siteUrls = new Set(sites.map((s) => s.siteUrl));
      const verified = siteUrls.has(props.gsc_site_url);
      checks.push(
        googleCheck(
          "gsc_property_verified",
          "GSC property verified",
          verified ? "pass" : "fail",
          verified
            ? "Mapped Search Console property is accessible on the connected Google account."
            : "Mapped GSC property was not found on the connected account. Re-select the property or reconnect Google.",
        ),
      );

      if (verified) {
        const sitemaps = await listGscSitemaps(accessToken, props.gsc_site_url);
        const hasSitemap = sitemaps.length > 0;
        const hasErrors = sitemaps.some((s) => (s.errors ?? 0) > 0);
        checks.push(
          googleCheck(
            "gsc_sitemap_submitted",
            "GSC sitemap submitted",
            hasSitemap && !hasErrors ? "pass" : hasSitemap ? "warn" : "warn",
            hasSitemap
              ? hasErrors
                ? `Sitemap(s) registered but ${sitemaps.filter((s) => (s.errors ?? 0) > 0).length} report errors in Search Console.`
                : `${sitemaps.length} sitemap(s) registered in Search Console.`
              : "No sitemaps found in Search Console for this property.",
          ),
        );

        const totals = await fetchGsc28DayTotals(accessToken, props.gsc_site_url);
        checks.push(
          googleCheck(
            "gsc_index_coverage",
            "GSC search visibility (28d)",
            totals.impressions > 0 ? "pass" : "warn",
            totals.impressions > 0
              ? `${totals.impressions.toLocaleString()} impressions and ${totals.clicks.toLocaleString()} clicks in the last 28 days.`
              : "No Search Console impressions in the last 28 days — normal for new sites; confirm indexing separately.",
          ),
        );

        metrics = {
          gsc_clicks_28d: totals.clicks,
          gsc_impressions_28d: totals.impressions,
          ga4_sessions_28d: 0,
          ga4_active_users_28d: 0,
        };
      }
    }

    if (ga4Mapped && props?.ga4_property_id) {
      const ga4 = await fetchGa4_28DayTotals(accessToken, props.ga4_property_id);
      checks.push(
        googleCheck(
          "ga4_data_received",
          "GA4 data received (28d)",
          ga4.sessions > 0 ? "pass" : "warn",
          ga4.sessions > 0
            ? `${ga4.sessions.toLocaleString()} sessions and ${ga4.activeUsers.toLocaleString()} active users in the last 28 days.`
            : "No GA4 sessions in the last 28 days — tag may be missing, blocked, or not yet receiving traffic.",
        ),
      );
      const prev = metrics;
      metrics = {
        gsc_clicks_28d: prev?.gsc_clicks_28d ?? 0,
        gsc_impressions_28d: prev?.gsc_impressions_28d ?? 0,
        ga4_sessions_28d: ga4.sessions,
        ga4_active_users_28d: ga4.activeUsers,
      };
    }
  } catch (err) {
    observabilityLog.warn("google.field_checks_failed", {
      communityId,
      error: err instanceof Error ? err.message : String(err),
    });
    checks.push(
      googleCheck(
        "google_api_error",
        "Google API",
        "warn",
        "Could not complete all Google checks (rate limit or API error). Try again later.",
      ),
    );
  }

  return { checks, metrics };
}

function notConnectedChecks(hint: string): AuditCheck[] {
  return [
    googleCheck("gsc_property_linked", "GSC property linked", "warn", hint),
    googleCheck("ga4_property_linked", "GA4 property linked", "warn", hint),
  ];
}
