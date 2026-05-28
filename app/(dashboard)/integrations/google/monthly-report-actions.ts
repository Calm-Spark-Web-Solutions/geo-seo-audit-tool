"use server";

import { revalidatePath } from "next/cache";

import { runMonthlyGoogleReportForCompany } from "@/lib/integrations/google/monthly-report";
import { parseAdditionalRecipients } from "@/lib/integrations/google/monthly-report-settings";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type MonthlyReportActionState = { ok: boolean; error?: string; message?: string };

async function assertCompanyAdmin(
  companyId: string,
): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "You must be signed in." };
  }

  const { data: member } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = member?.role as string | undefined;
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only organization owners and admins can change monthly report settings." };
  }

  return { ok: true, userId: user.id, email: user.email };
}

function checkboxValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

export async function saveMonthlyReportSettings(
  _prev: MonthlyReportActionState,
  formData: FormData,
): Promise<MonthlyReportActionState> {
  const companyId = String(formData.get("companyId") ?? "").trim();
  if (!companyId) return { ok: false, error: "Missing organization." };

  const auth = await assertCompanyAdmin(companyId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const additionalRaw = String(formData.get("additionalRecipients") ?? "");
  const additional_recipients = parseAdditionalRecipients(additionalRaw);

  const supabase = await createClient();
  const { error } = await supabase.from("company_monthly_report_settings").upsert(
    {
      company_id: companyId,
      enabled: checkboxValue(formData, "enabled"),
      include_owner_emails: checkboxValue(formData, "includeOwnerEmails"),
      include_admin_emails: checkboxValue(formData, "includeAdminEmails"),
      include_contact_email: checkboxValue(formData, "includeContactEmail"),
      additional_recipients,
      queue_monthly_scans: checkboxValue(formData, "queueMonthlyScans"),
      sync_metrics_before_send: checkboxValue(formData, "syncMetricsBeforeSend"),
      updated_at: new Date().toISOString(),
      updated_by: auth.userId,
    },
    { onConflict: "company_id" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/integrations/google");
  return { ok: true, message: "Monthly report settings saved." };
}

export async function sendMonthlyReportTestEmail(
  _prev: MonthlyReportActionState,
  formData: FormData,
): Promise<MonthlyReportActionState> {
  const companyId = String(formData.get("companyId") ?? "").trim();
  if (!companyId) return { ok: false, error: "Missing organization." };

  const auth = await assertCompanyAdmin(companyId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: conn } = await (await createClient())
    .from("company_google_connections")
    .select("company_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!conn) {
    return { ok: false, error: "Connect Google before sending a test report." };
  }

  const supabase = createServiceClient();
  const result = await runMonthlyGoogleReportForCompany(supabase, companyId, {
    recordSent: false,
    skipIdempotencyCheck: true,
    recipientsOverride: [auth.email],
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Failed to send test email." };
  }

  return {
    ok: true,
    message: `Test report sent to ${auth.email}.`,
  };
}
