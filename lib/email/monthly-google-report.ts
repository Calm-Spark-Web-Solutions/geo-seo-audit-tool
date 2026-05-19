export interface MonthlyReportCommunityRow {
  communityId: string;
  name: string;
  websiteUrl: string;
  gscClicks: number | null;
  gscImpressions: number | null;
  ga4Sessions: number | null;
  ga4ActiveUsers: number | null;
  latestScanScore: number | null;
  scanQueued: boolean;
  metricsWarnings: string[];
}

export interface MonthlyGoogleReportInput {
  companyName: string;
  reportMonthLabel: string;
  siteUrl: string;
  communities: MonthlyReportCommunityRow[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMetric(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US");
}

export function dedupeReportRecipients(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    if (!e || !e.includes("@") || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

export function buildMonthlyGoogleReportHtml(
  input: MonthlyGoogleReportInput,
): string {
  const base = input.siteUrl.replace(/\/$/, "");
  const rows = input.communities
    .map((c) => {
      const communityUrl = `${base}/communities/${encodeURIComponent(c.communityId)}`;
      const warn =
        c.metricsWarnings.length > 0
          ? `<p style="margin:4px 0 0;font-size:12px;color:#b45309;">${escapeHtml(c.metricsWarnings.join(" · "))}</p>`
          : "";
      const scanNote = c.scanQueued
        ? '<p style="margin:4px 0 0;font-size:12px;color:#166534;">Monthly visibility scan queued (may still be running).</p>'
        : "";
      const score =
        c.latestScanScore != null
          ? `Latest scan score: <strong>${c.latestScanScore}</strong>`
          : "No completed scan yet";

      return `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <a href="${escapeHtml(communityUrl)}" style="font-weight:600;color:#111827;">${escapeHtml(c.name)}</a>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(c.websiteUrl)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${score}</div>
            ${scanNote}
            ${warn}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">
            <div style="font-size:11px;color:#6b7280;">GSC clicks</div>
            <div style="font-weight:600;">${formatMetric(c.gscClicks)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:6px;">Impressions</div>
            <div style="font-weight:600;">${formatMetric(c.gscImpressions)}</div>
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">
            <div style="font-size:11px;color:#6b7280;">GA4 sessions</div>
            <div style="font-weight:600;">${formatMetric(c.ga4Sessions)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:6px;">Active users</div>
            <div style="font-weight:600;">${formatMetric(c.ga4ActiveUsers)}</div>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Monthly Google report</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 8px;">Monthly Google report — ${escapeHtml(input.companyName)}</h1>
  <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">
    ${escapeHtml(input.reportMonthLabel)} · Last 28 days (Search Console &amp; Analytics)
  </p>
  <p style="margin:0 0 20px;font-size:14px;">
    Traffic totals below were refreshed today. Visibility scans may still be running in the background.
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr>
        <th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;">Community</th>
        <th style="text-align:right;padding:8px;border-bottom:2px solid #e5e7eb;">Search Console</th>
        <th style="text-align:right;padding:8px;border-bottom:2px solid #e5e7eb;">Analytics</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="3" style="padding:12px;color:#6b7280;">No mapped communities.</td></tr>'}
    </tbody>
  </table>
  <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
    <a href="${escapeHtml(base)}/settings" style="color:#6b7280;">Manage Google connection</a>
  </p>
</body>
</html>`;
}

export function buildMonthlyGoogleReportSubject(
  companyName: string,
  reportMonthLabel: string,
): string {
  return `Monthly Google report — ${companyName} (${reportMonthLabel})`;
}
