"use server";

import { revalidatePath } from "next/cache";

import {
  isAuditRunnerConfigured,
  kickAuditRunnerFireAndForget,
} from "@/lib/audit/runner-kick";
import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

export type RetryRunnerState = {
  ok: boolean;
  error?: string;
};

// Tighter than the generic mutation cap because each retry kicks a new
// runner invocation against PSI / Anthropic — abusing this would burn
// real money.
const RETRY_MAX = 10;
const RETRY_WINDOW_S = 60;

/**
 * Re-invokes POST `/api/visibility-scans/[id]/run` for users who can see the audit row.
 * Use when a job is stuck pending or the automatic kick failed (wrong URL,
 * etc.). Access matches read scope on `audits` via RLS.
 */
export async function retryAuditRunner(
  _prev: RetryRunnerState,
  formData: FormData,
): Promise<RetryRunnerState> {
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
    `audit:retry:${user.id}`,
    RETRY_MAX,
    RETRY_WINDOW_S,
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Too many retry attempts. Please wait a minute and try again.",
    };
  }

  const { data: audit, error } = await supabase
    .from("audits")
    .select("id, community_id, status")
    .eq("id", auditId)
    .maybeSingle();

  if (error || !audit) {
    return { ok: false, error: "Audit not found or you don’t have access." };
  }

  if (audit.status !== "pending" && audit.status !== "running") {
    return {
      ok: false,
      error: "Audit is not in a runnable state.",
    };
  }

  if (!isAuditRunnerConfigured()) {
    return {
      ok: false,
      error:
        "Audit runner is not configured. Please contact support.",
    };
  }

  kickAuditRunnerFireAndForget(audit.id);

  if (audit.community_id) {
    revalidatePath(`/communities/${audit.community_id}`);
  }
  revalidatePath(`/visibility-scans/${auditId}`);
  return { ok: true };
}
