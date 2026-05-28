import type { SupabaseClient } from "@supabase/supabase-js";

import { scheduleCommunityScan } from "@/lib/audit/schedule-community-scan";
import {
  buildMonthlyGoogleReportHtml,
  buildMonthlyGoogleReportSubject,
  type MonthlyReportCommunityRow,
} from "@/lib/email/monthly-google-report";
import { isResendConfigured, sendEmail } from "@/lib/email/resend-client";
import { syncGoogleMetricsForCommunityDetailed } from "@/lib/integrations/google/metrics-snapshot";
import {
  loadMonthlyReportSettings,
  resolveMonthlyReportRecipients,
} from "@/lib/integrations/google/monthly-report-recipients";
import { resolveSiteUrl } from "@/lib/audit/runner-kick";
import { observabilityLog } from "@/lib/observability/log";

export interface MonthlyGoogleReportSummary {
  companiesProcessed: number;
  companiesSkipped: number;
  emailsSent: number;
  scansQueued: number;
  errors: string[];
}

export interface RunMonthlyGoogleReportForCompanyOptions {
  /** When false, skip writing company_monthly_google_reports (test emails). Default true. */
  recordSent?: boolean;
  /** When set, send only to these addresses (test). */
  recipientsOverride?: string[];
  /** Skip “already sent this month” check (test). Default false. */
  skipIdempotencyCheck?: boolean;
  reportMonth?: string;
}

export interface RunMonthlyGoogleReportForCompanyResult {
  ok: boolean;
  error?: string;
  recipientCount?: number;
  scansQueued?: number;
}

export function utcMonthStart(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export function formatReportMonthLabel(reportMonth: string): string {
  const d = new Date(`${reportMonth}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export async function runMonthlyGoogleReportForCompany(
  supabase: SupabaseClient,
  companyId: string,
  options: RunMonthlyGoogleReportForCompanyOptions = {},
): Promise<RunMonthlyGoogleReportForCompanyResult> {
  const recordSent = options.recordSent !== false;
  const skipIdempotency = options.skipIdempotencyCheck === true;
  const reportMonth = options.reportMonth ?? utcMonthStart();
  const reportMonthLabel = formatReportMonthLabel(reportMonth);
  const siteUrl = resolveSiteUrl() ?? "http://localhost:3000";

  const settings = await loadMonthlyReportSettings(supabase, companyId);
  if (!settings.enabled && !options.recipientsOverride) {
    return { ok: false, error: "Monthly report is disabled for this organization." };
  }

  if (!skipIdempotency && recordSent) {
    const { data: sentRow } = await supabase
      .from("company_monthly_google_reports")
      .select("company_id")
      .eq("company_id", companyId)
      .eq("report_month", reportMonth)
      .maybeSingle();

    if (sentRow) {
      return { ok: false, error: "Report already sent for this month." };
    }
  }

  const { data: companyRow } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  const companyName = (companyRow?.name as string | undefined) ?? "Organization";

  const { data: communityRows } = await supabase
    .from("communities")
    .select("id, name, website_url")
    .eq("company_id", companyId);

  const communities = communityRows ?? [];
  const communityIds = communities.map((c) => c.id as string);
  if (communityIds.length === 0) {
    return { ok: false, error: "No communities in this organization." };
  }

  const { data: propRows } = await supabase
    .from("community_google_properties")
    .select("community_id, gsc_site_url, ga4_property_id")
    .in("community_id", communityIds)
    .or("gsc_site_url.not.is.null,ga4_property_id.not.is.null");

  type PropRow = {
    community_id: string;
    gsc_site_url: string | null;
    ga4_property_id: string | null;
  };

  const communityById = new Map(
    communities.map((c) => [c.id as string, c]),
  );

  const mappedCommunities = ((propRows ?? []) as PropRow[]).filter((p) =>
    communityById.has(p.community_id),
  );

  if (mappedCommunities.length === 0) {
    return {
      ok: false,
      error: "No communities with Google properties mapped.",
    };
  }

  const reportRows: MonthlyReportCommunityRow[] = [];
  let communitiesSynced = 0;
  let scansQueued = 0;

  for (const prop of mappedCommunities) {
    const c = communityById.get(prop.community_id);
    if (!c) continue;

    const communityId = prop.community_id;
    const warnings: string[] = [];

    if (settings.sync_metrics_before_send) {
      const syncResult = await syncGoogleMetricsForCommunityDetailed(
        supabase,
        communityId,
        "daily_sync",
      );
      if (syncResult.ok) {
        communitiesSynced += 1;
        warnings.push(...syncResult.warnings);
      } else {
        warnings.push(syncResult.error);
      }
    }

    let scanQueued = false;
    if (settings.queue_monthly_scans) {
      const scanResult = await scheduleCommunityScan(
        supabase,
        communityId,
        "monthly",
      );
      scanQueued = scanResult.ok;
      if (scanQueued) scansQueued += 1;
    }

    const { data: snap } = await supabase
      .from("community_google_metrics_snapshots")
      .select(
        "gsc_clicks_28d, gsc_impressions_28d, ga4_sessions_28d, ga4_active_users_28d",
      )
      .eq("community_id", communityId)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: latestAudit } = await supabase
      .from("audits")
      .select("score")
      .eq("community_id", communityId)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    reportRows.push({
      communityId,
      name: c.name as string,
      websiteUrl: c.website_url as string,
      gscClicks: (snap?.gsc_clicks_28d as number | null) ?? null,
      gscImpressions: (snap?.gsc_impressions_28d as number | null) ?? null,
      ga4Sessions: (snap?.ga4_sessions_28d as number | null) ?? null,
      ga4ActiveUsers: (snap?.ga4_active_users_28d as number | null) ?? null,
      latestScanScore: (latestAudit?.score as number | null) ?? null,
      scanQueued,
      metricsWarnings: warnings,
    });
  }

  const recipients =
    options.recipientsOverride ??
    (await resolveMonthlyReportRecipients(supabase, companyId, settings));

  if (recipients.length === 0) {
    return { ok: false, error: "No recipients configured." };
  }

  const html = buildMonthlyGoogleReportHtml({
    companyId,
    companyName,
    reportMonthLabel,
    siteUrl,
    communities: reportRows,
    syncMetricsBeforeSend: settings.sync_metrics_before_send,
    queueMonthlyScans: settings.queue_monthly_scans,
  });
  const subject = buildMonthlyGoogleReportSubject(companyName, reportMonthLabel);

  if (isResendConfigured()) {
    const sent = await sendEmail({ to: recipients, subject, html });
    if (!sent.ok && !sent.skipped) {
      return { ok: false, error: sent.error };
    }
  } else {
    observabilityLog.info("monthly_report.email_preview", {
      companyId,
      subject,
      recipientCount: recipients.length,
      test: Boolean(options.recipientsOverride),
    });
  }

  if (recordSent) {
    const { error: insertErr } = await supabase
      .from("company_monthly_google_reports")
      .insert({
        company_id: companyId,
        report_month: reportMonth,
        recipient_count: recipients.length,
        communities_synced: communitiesSynced,
        scans_queued: scansQueued,
      });

    if (insertErr) {
      return { ok: false, error: insertErr.message };
    }
  }

  return {
    ok: true,
    recipientCount: recipients.length,
    scansQueued,
  };
}

export async function runMonthlyGoogleReportForAllCompanies(
  supabase: SupabaseClient,
): Promise<MonthlyGoogleReportSummary> {
  const reportMonth = utcMonthStart();

  const summary: MonthlyGoogleReportSummary = {
    companiesProcessed: 0,
    companiesSkipped: 0,
    emailsSent: 0,
    scansQueued: 0,
    errors: [],
  };

  const { data: connections, error: connErr } = await supabase
    .from("company_google_connections")
    .select("company_id, companies(id, name)");

  if (connErr) {
    summary.errors.push(connErr.message);
    return summary;
  }

  type ConnRow = {
    company_id: string;
    companies: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  for (const row of (connections ?? []) as ConnRow[]) {
    const companyId = row.company_id;
    const companyEmbed = Array.isArray(row.companies)
      ? row.companies[0]
      : row.companies;
    const companyName = companyEmbed?.name ?? "Organization";

    const settings = await loadMonthlyReportSettings(supabase, companyId);
    if (!settings.enabled) {
      summary.companiesSkipped += 1;
      continue;
    }

    const { data: sentRow } = await supabase
      .from("company_monthly_google_reports")
      .select("company_id")
      .eq("company_id", companyId)
      .eq("report_month", reportMonth)
      .maybeSingle();

    if (sentRow) {
      summary.companiesSkipped += 1;
      continue;
    }

    const result = await runMonthlyGoogleReportForCompany(supabase, companyId, {
      recordSent: true,
      reportMonth,
      skipIdempotencyCheck: true,
    });

    if (!result.ok) {
      if (
        result.error === "No communities in this organization." ||
        result.error === "No communities with Google properties mapped." ||
        result.error === "No recipients configured."
      ) {
        summary.companiesSkipped += 1;
        if (result.error === "No recipients configured.") {
          summary.errors.push(`${companyName}: no recipients`);
        }
      } else {
        summary.errors.push(`${companyName}: ${result.error}`);
      }
      continue;
    }

    summary.companiesProcessed += 1;
    summary.emailsSent += 1;
    summary.scansQueued += result.scansQueued ?? 0;
  }

  return summary;
}
