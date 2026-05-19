"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type GooglePropertiesSaveState = { ok: boolean; error?: string };

export type CommunityGooglePropertyRow = {
  communityId: string;
  gscSiteUrl: string | null;
  ga4PropertyId: string | null;
};

async function upsertCommunityGoogleProperty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: CommunityGooglePropertyRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("community_google_properties").upsert(
    {
      community_id: row.communityId,
      gsc_site_url: row.gscSiteUrl,
      ga4_property_id: row.ga4PropertyId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "community_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function revalidateCommunityGooglePaths(communityId: string, companyId?: string) {
  revalidatePath(`/communities/${communityId}`);
  revalidatePath(`/communities/${communityId}/edit`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function saveCommunityGoogleProperties(
  _prev: GooglePropertiesSaveState,
  formData: FormData,
): Promise<GooglePropertiesSaveState> {
  const communityId = formData.get("community_id");
  if (typeof communityId !== "string" || !communityId) {
    return { ok: false, error: "Missing community id." };
  }

  const gscSiteUrl =
    typeof formData.get("gsc_site_url") === "string"
      ? (formData.get("gsc_site_url") as string).trim() || null
      : null;
  const ga4PropertyId =
    typeof formData.get("ga4_property_id") === "string"
      ? (formData.get("ga4_property_id") as string).trim() || null
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: community, error: readErr } = await supabase
    .from("communities")
    .select("id, company_id")
    .eq("id", communityId)
    .maybeSingle();

  if (readErr || !community) {
    return { ok: false, error: readErr?.message ?? "Community not found." };
  }

  const result = await upsertCommunityGoogleProperty(supabase, {
    communityId,
    gscSiteUrl,
    ga4PropertyId,
  });
  if (!result.ok) return result;

  revalidateCommunityGooglePaths(
    communityId,
    community.company_id as string | undefined,
  );
  return { ok: true };
}

export async function saveCompanyGooglePropertiesBatch(
  companyId: string,
  rows: CommunityGooglePropertyRow[],
): Promise<GooglePropertiesSaveState> {
  if (!companyId) return { ok: false, error: "Missing organization id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: member } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !["owner", "admin"].includes(member.role as string)) {
    return { ok: false, error: "You do not have permission to update mappings." };
  }

  const communityIds = rows.map((r) => r.communityId);
  if (communityIds.length === 0) return { ok: true };

  const { data: communities, error: listErr } = await supabase
    .from("communities")
    .select("id")
    .eq("company_id", companyId)
    .in("id", communityIds);

  if (listErr) return { ok: false, error: listErr.message };

  const allowed = new Set((communities ?? []).map((c) => c.id as string));
  for (const row of rows) {
    if (!allowed.has(row.communityId)) {
      return { ok: false, error: "One or more communities do not belong to this organization." };
    }
  }

  for (const row of rows) {
    const result = await upsertCommunityGoogleProperty(supabase, {
      communityId: row.communityId,
      gscSiteUrl: row.gscSiteUrl?.trim() || null,
      ga4PropertyId: row.ga4PropertyId?.trim() || null,
    });
    if (!result.ok) return result;
  }

  revalidatePath(`/companies/${companyId}`);
  for (const row of rows) {
    revalidateCommunityGooglePaths(row.communityId, companyId);
  }

  return { ok: true };
}
