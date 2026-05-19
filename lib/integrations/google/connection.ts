import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptSecret } from "@/lib/security/token-crypto";

import { refreshGoogleAccessToken } from "./oauth";

export interface CompanyGoogleConnectionRow {
  company_id: string;
  refresh_token_encrypted: string;
  google_account_email: string | null;
  scopes: string[] | null;
}

export async function getCompanyIdForCommunity(
  supabase: SupabaseClient,
  communityId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("communities")
    .select("company_id")
    .eq("id", communityId)
    .maybeSingle();
  return (data?.company_id as string | undefined) ?? null;
}

export async function loadGoogleConnection(
  supabase: SupabaseClient,
  companyId: string,
): Promise<CompanyGoogleConnectionRow | null> {
  const { data } = await supabase
    .from("company_google_connections")
    .select("company_id, refresh_token_encrypted, google_account_email, scopes")
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as CompanyGoogleConnectionRow | null) ?? null;
}

export async function getGoogleAccessTokenForCompany(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const row = await loadGoogleConnection(supabase, companyId);
  if (!row?.refresh_token_encrypted) return null;
  try {
    const refreshToken = decryptSecret(row.refresh_token_encrypted);
    const tokens = await refreshGoogleAccessToken(refreshToken);
    return tokens.access_token;
  } catch {
    await supabase
      .from("company_google_connections")
      .update({
        last_error: "Failed to refresh Google access token",
      })
      .eq("company_id", companyId);
    return null;
  }
}

export interface CommunityGooglePropertiesRow {
  community_id: string;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
}

export async function loadCommunityGoogleProperties(
  supabase: SupabaseClient,
  communityId: string,
): Promise<CommunityGooglePropertiesRow | null> {
  const { data } = await supabase
    .from("community_google_properties")
    .select("community_id, gsc_site_url, ga4_property_id")
    .eq("community_id", communityId)
    .maybeSingle();
  return (data as CommunityGooglePropertiesRow | null) ?? null;
}
