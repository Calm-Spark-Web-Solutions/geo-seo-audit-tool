"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { markAuditFailed, runAudit } from "@/lib/audit/run";
import { createClient } from "@/lib/supabase/server";

export type StartAuditFormState = {
  ok: boolean;
  error?: string;
};

export async function startAudit(
  _prev: StartAuditFormState,
  formData: FormData,
): Promise<StartAuditFormState> {
  const communityId = formData.get("community_id");
  if (typeof communityId !== "string" || !communityId) {
    return { ok: false, error: "Missing community." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: community, error: cErr } = await supabase
    .from("communities")
    .select("id, website_url")
    .eq("id", communityId)
    .maybeSingle();

  if (cErr || !community) {
    return {
      ok: false,
      error: "Community not found or you don’t have access.",
    };
  }

  const { data: audit, error: aErr } = await supabase
    .from("audits")
    .insert({
      community_id: communityId,
      status: "pending",
      pages_crawled: 0,
    })
    .select("id")
    .single();

  if (aErr || !audit) {
    return {
      ok: false,
      error: aErr?.message ?? "Could not start audit.",
    };
  }

  // Fire-and-forget: redirect immediately so the user sees live progress on
  // the audit detail page. The runner updates `audits` and `audit_pages` as
  // it goes; the client polls the snapshot route.
  const runPromise = runAudit({
    supabase,
    auditId: audit.id,
    websiteUrl: community.website_url,
  });
  runPromise.catch(async () => {
    try {
      await markAuditFailed(supabase, audit.id);
    } catch {
      /* swallow: audit row may already be gone */
    }
  });

  revalidatePath(`/communities/${communityId}`);
  redirect(`/audits/${audit.id}`);
}
