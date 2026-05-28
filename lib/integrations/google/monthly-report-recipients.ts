import type { SupabaseClient } from "@supabase/supabase-js";

import { dedupeReportRecipients } from "@/lib/email/monthly-google-report";
import {
  DEFAULT_MONTHLY_REPORT_SETTINGS,
  normalizeSettingsRow,
  type MonthlyReportSettings,
} from "@/lib/integrations/google/monthly-report-settings";
import { observabilityLog } from "@/lib/observability/log";

export async function loadMonthlyReportSettings(
  supabase: SupabaseClient,
  companyId: string,
): Promise<MonthlyReportSettings> {
  const { data, error } = await supabase
    .from("company_monthly_report_settings")
    .select(
      "company_id, enabled, include_owner_emails, include_admin_emails, include_contact_email, additional_recipients, queue_monthly_scans, sync_metrics_before_send",
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    observabilityLog.warn("monthly_report.settings_load_failed", {
      companyId,
      error: error.message,
    });
    return DEFAULT_MONTHLY_REPORT_SETTINGS(companyId);
  }

  return normalizeSettingsRow(companyId, data as Partial<MonthlyReportSettings> | null);
}

export function buildMonthlyReportRecipientList(input: {
  settings: MonthlyReportSettings;
  memberEmails: string[];
  contactEmail: string | null;
}): string[] {
  const { settings, memberEmails, contactEmail } = input;
  if (!settings.enabled) return [];

  const emails: string[] = [];
  if (memberEmails.length > 0) emails.push(...memberEmails);
  if (settings.include_contact_email && contactEmail?.trim()) {
    emails.push(contactEmail.trim());
  }
  if (settings.additional_recipients.length > 0) {
    emails.push(...settings.additional_recipients);
  }
  return dedupeReportRecipients(emails);
}

export async function resolveMonthlyReportRecipients(
  supabase: SupabaseClient,
  companyId: string,
  settings?: MonthlyReportSettings,
): Promise<string[]> {
  const cfg = settings ?? (await loadMonthlyReportSettings(supabase, companyId));

  const roles: string[] = [];
  if (cfg.include_owner_emails) roles.push("owner");
  if (cfg.include_admin_emails) roles.push("admin");

  let memberEmails: string[] = [];
  if (roles.length > 0) {
    const { data, error } = await supabase.rpc(
      "list_company_member_emails_by_role",
      { p_company_id: companyId, p_roles: roles },
    );
    if (error) {
      observabilityLog.warn("monthly_report.member_emails_failed", {
        companyId,
        error: error.message,
      });
    } else {
      const rows = (data ?? []) as Array<{ email: string }>;
      memberEmails = rows.map((r) => r.email);
    }
  }

  let contactEmail: string | null = null;
  if (cfg.include_contact_email) {
    const { data: company } = await supabase
      .from("companies")
      .select("contact_email")
      .eq("id", companyId)
      .maybeSingle();
    contactEmail = (company?.contact_email as string | null) ?? null;
  }

  return buildMonthlyReportRecipientList({
    settings: cfg,
    memberEmails,
    contactEmail,
  });
}
