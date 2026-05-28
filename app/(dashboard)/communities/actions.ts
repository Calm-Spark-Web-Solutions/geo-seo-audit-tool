"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  communityQuotaAllowsCreate,
  getCommunityQuotaSnapshot,
} from "@/lib/billing/community-quota";
import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import { loadManualGoogleCoverageForCommunity } from "@/lib/checklists/load-manual-google-coverage";
import { isManualItemReplacedByGoogle } from "@/lib/checklists/manual-google-coverage";
import {
  ALLOWED_COMMUNITY_MANUAL_KEYS,
  sanitizeCommunityManualResults,
} from "@/lib/validation/community-manual";
import { communityInputSchema } from "@/lib/validation/communities";
import type { CommunityManualResults } from "@/types";

const MUTATION_MAX = 30;
const MUTATION_WINDOW_S = 60;
const RATE_LIMIT_COPY = "Too many requests. Please wait a moment and try again.";

export type ManualChecklistSaveState = { ok: boolean; error?: string };

export async function saveCommunityManualChecklist(
  communityId: string,
  payload: unknown,
): Promise<ManualChecklistSaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const parsed = sanitizeCommunityManualResults(payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { data: existing, error: readErr } = await supabase
    .from("communities")
    .select("id, manual_check_results, company_id")
    .eq("id", communityId)
    .maybeSingle();

  if (readErr || !existing) {
    return { ok: false, error: readErr?.message ?? "Community not found." };
  }

  const coverage = await loadManualGoogleCoverageForCommunity(
    supabase,
    communityId,
  );

  const prev =
    (existing.manual_check_results as CommunityManualResults | null) ?? {};
  const merged: CommunityManualResults = { ...prev, ...parsed.data };
  for (const k of Object.keys(merged)) {
    if (!ALLOWED_COMMUNITY_MANUAL_KEYS.has(k)) {
      delete merged[k];
    }
    if (isManualItemReplacedByGoogle(k, coverage)) {
      delete merged[k];
    }
  }
  const stamp = new Date().toISOString();
  for (const k of Object.keys(parsed.data)) {
    const row = merged[k];
    if (row) merged[k] = { ...row, updated_at: stamp };
  }

  const { error: upErr } = await supabase
    .from("communities")
    .update({ manual_check_results: merged })
    .eq("id", communityId);

  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath(`/communities/${communityId}`);
  revalidatePath("/visibility-scans");

  return { ok: true };
}

export type CommunityFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"name" | "website_url" | "facility_type", string>>;
};

function parseForm(formData: FormData) {
  return communityInputSchema.safeParse({
    name: formData.get("name"),
    website_url: formData.get("website_url"),
    facility_type: formData.get("facility_type"),
  });
}

function fieldErrorsFrom(zodError: import("zod").ZodError): CommunityFormState["fieldErrors"] {
  const result: CommunityFormState["fieldErrors"] = {};
  for (const issue of zodError.issues) {
    const key = issue.path[0];
    if (key === "name" || key === "website_url" || key === "facility_type") {
      result[key] = issue.message;
    }
  }
  return result;
}

export async function createCommunity(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const companyId = formData.get("company_id");
  if (typeof companyId !== "string" || !companyId) {
    return { ok: false, error: "Missing organization id." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  // Defense-in-depth getUser; see companies/actions.ts comment.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const allowed = await consumeRateLimit(
    supabase,
    `community:create:${user.id}`,
    MUTATION_MAX,
    MUTATION_WINDOW_S,
  );
  if (!allowed) return { ok: false, error: RATE_LIMIT_COPY };

  // Bucket enforcement: hard cap the number of communities the org can
  // create on the current plan. Unlimited (dev/staging/Stripe-off) and
  // partner overrides skip the check.
  const quota = await getCommunityQuotaSnapshot(supabase, user.id);
  if (!communityQuotaAllowsCreate(quota)) {
    return {
      ok: false,
      error:
        quota.kind === "limited"
          ? `Your plan includes ${quota.limit} community${quota.limit === 1 ? "" : "ies"}. Upgrade in Billing to add another.`
          : "Community limit reached for your plan.",
    };
  }

  const { data, error } = await supabase
    .from("communities")
    .insert({ ...parsed.data, company_id: companyId })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create community." };
  }

  revalidatePath(`/companies/${companyId}`);
  redirect(`/communities/${data.id}`);
}

export async function updateCommunity(
  _prev: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "Missing community id." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const allowed = await consumeRateLimit(
    supabase,
    `community:update:${user.id}`,
    MUTATION_MAX,
    MUTATION_WINDOW_S,
  );
  if (!allowed) return { ok: false, error: RATE_LIMIT_COPY };

  const { data: existing } = await supabase
    .from("communities")
    .select("company_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("communities")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/communities/${id}`);
  if (existing?.company_id) revalidatePath(`/companies/${existing.company_id}`);
  redirect(`/communities/${id}`);
}

export async function deleteCommunity(communityId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const allowed = await consumeRateLimit(
    supabase,
    `community:delete:${user.id}`,
    MUTATION_MAX,
    MUTATION_WINDOW_S,
  );
  if (!allowed) throw new Error(RATE_LIMIT_COPY);

  const { data: existing } = await supabase
    .from("communities")
    .select("company_id")
    .eq("id", communityId)
    .maybeSingle();

  const { error } = await supabase
    .from("communities")
    .delete()
    .eq("id", communityId);

  if (error) throw new Error(error.message);

  if (existing?.company_id) {
    revalidatePath(`/companies/${existing.company_id}`);
    redirect(`/companies/${existing.company_id}`);
  }
  redirect("/companies");
}
