import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadCommunityGoogleProperties,
  loadGoogleConnection,
} from "@/lib/integrations/google/connection";
import type { ManualGoogleCoverageInput } from "@/lib/checklists/manual-google-coverage";
import type { AuditCheck } from "@/types";

/**
 * Builds expert-checklist Google coverage for a community.
 * When `latestGoogleFieldChecks` is omitted, uses the newest complete audit.
 */
export async function loadManualGoogleCoverageForCommunity(
  supabase: SupabaseClient,
  communityId: string,
  options?: { latestGoogleFieldChecks?: AuditCheck[] | null },
): Promise<ManualGoogleCoverageInput> {
  const { data: community } = await supabase
    .from("communities")
    .select("company_id")
    .eq("id", communityId)
    .maybeSingle();

  const companyId = (community?.company_id as string | undefined) ?? null;
  if (!companyId) {
    return {
      companyGoogleConnected: false,
      gscSiteUrl: null,
      ga4PropertyId: null,
      latestGoogleFieldChecks: options?.latestGoogleFieldChecks ?? null,
    };
  }

  const [connection, props, latestAudit] = await Promise.all([
    loadGoogleConnection(supabase, companyId),
    loadCommunityGoogleProperties(supabase, communityId),
    options?.latestGoogleFieldChecks !== undefined
      ? Promise.resolve(null)
      : supabase
          .from("audits")
          .select("google_field_checks")
          .eq("community_id", communityId)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);

  let latestGoogleFieldChecks: AuditCheck[] | null =
    options?.latestGoogleFieldChecks ?? null;

  if (options?.latestGoogleFieldChecks === undefined && latestAudit?.data) {
    const raw = latestAudit.data.google_field_checks;
    latestGoogleFieldChecks = Array.isArray(raw) ? (raw as AuditCheck[]) : null;
  }

  return {
    companyGoogleConnected: Boolean(connection),
    gscSiteUrl: props?.gsc_site_url ?? null,
    ga4PropertyId: props?.ga4_property_id ?? null,
    latestGoogleFieldChecks,
  };
}
