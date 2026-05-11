"use server";

import { revalidatePath } from "next/cache";

import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type CancelAuditState = {
  ok: boolean;
  error?: string;
};

const MUTATION_MAX = 30;
const MUTATION_WINDOW_S = 60;

/**
 * Mark an in-flight audit as cancelled. Access is enforced by the existing
 * audits RLS chain (member-of-company -> community -> audit), so we just
 * scope the update by `id` + non-terminal status.
 *
 * The runner observes `audits.status = 'cancelled'` between scoring batches
 * and exits cleanly without clobbering `pages_crawled` or `progress_total`.
 * The queue helper translates that into `audit_jobs.status = 'cancelled'`.
 */
export async function cancelAudit(
  _prev: CancelAuditState,
  formData: FormData,
): Promise<CancelAuditState> {
  const auditId = formData.get("audit_id");
  if (typeof auditId !== "string" || !auditId) {
    return { ok: false, error: "Missing audit id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const allowed = await consumeRateLimit(
    supabase,
    `audit:cancel:${user.id}`,
    MUTATION_MAX,
    MUTATION_WINDOW_S,
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Too many requests. Please wait a moment and try again.",
    };
  }

  const { data, error } = await supabase
    .from("audits")
    .update({ status: "cancelled" })
    .eq("id", auditId)
    .in("status", ["pending", "running"])
    .select("id, community_id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      error: "Audit is no longer running and can’t be cancelled.",
    };
  }

  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  await service
    .from("audit_jobs")
    .update({
      status: "cancelled",
      lease_until: null,
      updated_at: nowIso,
    })
    .eq("audit_id", auditId)
    .in("status", ["queued", "running"]);

  if (data.community_id) {
    revalidatePath(`/communities/${data.community_id}`);
  }
  revalidatePath(`/visibility-scans/${auditId}`);
  return { ok: true };
}
