import { isGoogleOAuthConfigured } from "@/lib/integrations/google/config";
import { googleMappingStatus } from "@/lib/integrations/google/google-properties-ui";
import { createClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types";

import {
  GoogleIntegrationsSection,
  type GoogleOrgRow,
} from "./GoogleIntegrationsSection";

function companyFromEmbed(
  c: { id: string; name: string } | { id: string; name: string }[] | null,
): { id: string; name: string } | null {
  if (!c) return null;
  return Array.isArray(c) ? (c[0] ?? null) : c;
}

export async function GoogleIntegrationsLoader({
  googleFlash,
  googleReason,
}: {
  googleFlash?: string;
  googleReason?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberRows } = await supabase
    .from("company_members")
    .select("company_id, role, companies(id, name)")
    .eq("user_id", user.id);

  type Row = {
    company_id: string;
    role: CompanyRole;
    companies: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const companyIds = (memberRows ?? []).map((r) => (r as Row).company_id);
  const { data: connections } =
    companyIds.length > 0
      ? await supabase
          .from("company_google_connections")
          .select("company_id, google_account_email")
          .in("company_id", companyIds)
      : { data: [] };

  const connByCompany = new Map(
    (connections ?? []).map((c) => [
      c.company_id as string,
      c.google_account_email as string | null,
    ]),
  );

  const { data: communityRows } =
    companyIds.length > 0
      ? await supabase
          .from("communities")
          .select("id, company_id")
          .in("company_id", companyIds)
      : { data: [] };

  const communityIds = (communityRows ?? []).map((c) => c.id as string);
  const { data: googlePropsRows } =
    communityIds.length > 0
      ? await supabase
          .from("community_google_properties")
          .select("community_id, gsc_site_url, ga4_property_id")
          .in("community_id", communityIds)
      : { data: [] };

  const propsByCommunity = new Map(
    (googlePropsRows ?? []).map((p) => [
      p.community_id as string,
      {
        gsc: p.gsc_site_url as string | null,
        ga4: p.ga4_property_id as string | null,
      },
    ]),
  );

  const communityCountByCompany = new Map<string, number>();
  const mappedCountByCompany = new Map<string, number>();
  for (const cid of companyIds) {
    communityCountByCompany.set(cid, 0);
    mappedCountByCompany.set(cid, 0);
  }
  for (const c of communityRows ?? []) {
    const companyId = c.company_id as string;
    communityCountByCompany.set(
      companyId,
      (communityCountByCompany.get(companyId) ?? 0) + 1,
    );
    const props = propsByCommunity.get(c.id as string);
    if (
      googleMappingStatus(props?.gsc, props?.ga4) === "mapped"
    ) {
      mappedCountByCompany.set(
        companyId,
        (mappedCountByCompany.get(companyId) ?? 0) + 1,
      );
    }
  }

  const organizations: GoogleOrgRow[] = ((memberRows ?? []) as Row[]).map((r) => {
    const company = companyFromEmbed(r.companies);
    return {
      companyId: r.company_id,
      companyName: company?.name ?? "Organization",
      canManage: r.role === "owner" || r.role === "admin",
      connected: connByCompany.has(r.company_id),
      googleAccountEmail: connByCompany.get(r.company_id) ?? null,
      communityCount: communityCountByCompany.get(r.company_id) ?? 0,
      mappedCommunityCount: mappedCountByCompany.get(r.company_id) ?? 0,
    };
  });

  const flash =
    googleFlash === "connected"
      ? "connected"
      : googleFlash === "error"
        ? "error"
        : undefined;

  return (
    <GoogleIntegrationsSection
      organizations={organizations}
      oauthConfigured={isGoogleOAuthConfigured()}
      flash={flash}
      flashReason={googleReason}
    />
  );
}
