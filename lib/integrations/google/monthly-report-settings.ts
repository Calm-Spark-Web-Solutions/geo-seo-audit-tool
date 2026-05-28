export interface MonthlyReportSettings {
  company_id: string;
  enabled: boolean;
  include_owner_emails: boolean;
  include_admin_emails: boolean;
  include_contact_email: boolean;
  additional_recipients: string[];
  queue_monthly_scans: boolean;
  sync_metrics_before_send: boolean;
}

export const DEFAULT_MONTHLY_REPORT_SETTINGS = (
  companyId: string,
): MonthlyReportSettings => ({
  company_id: companyId,
  enabled: true,
  include_owner_emails: true,
  include_admin_emails: true,
  include_contact_email: true,
  additional_recipients: [],
  queue_monthly_scans: true,
  sync_metrics_before_send: true,
});

export function normalizeSettingsRow(
  companyId: string,
  row: Partial<MonthlyReportSettings> | null | undefined,
): MonthlyReportSettings {
  if (!row) return DEFAULT_MONTHLY_REPORT_SETTINGS(companyId);
  return {
    company_id: companyId,
    enabled: row.enabled ?? true,
    include_owner_emails: row.include_owner_emails ?? true,
    include_admin_emails: row.include_admin_emails ?? true,
    include_contact_email: row.include_contact_email ?? true,
    additional_recipients: Array.isArray(row.additional_recipients)
      ? row.additional_recipients
      : [],
    queue_monthly_scans: row.queue_monthly_scans ?? true,
    sync_metrics_before_send: row.sync_metrics_before_send ?? true,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse comma/newline-separated emails; max 10 valid addresses. */
export function parseAdditionalRecipients(raw: string): string[] {
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of parts) {
    if (!EMAIL_RE.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= 10) break;
  }
  return out;
}

export function additionalRecipientsToDisplay(
  emails: string[],
): string {
  return emails.join(", ");
}
