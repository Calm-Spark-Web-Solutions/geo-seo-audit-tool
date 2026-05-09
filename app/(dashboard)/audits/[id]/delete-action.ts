"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { consumeRateLimit } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";

const REPORT_BUCKET = "audit-reports";

const MUTATION_MAX = 30;
const MUTATION_WINDOW_S = 60;

/**
 * Delete an audit and its derived artifacts.
 *
 * Refuses to delete an in-flight (`pending` / `running`) audit so we never
 * race the runner mid-batch. The user is told to cancel first; the cancel
 * action flips status to `cancelled` and the runner exits cleanly within
 * one batch, after which delete is allowed.
 *
 * Cascade ownership:
 *   - `audit_pages` cascades via the FK in 001_initial_schema.
 *   - `audit_jobs` cascades via the FK in 009_audit_ops.
 *   - The signed-PDF object in Supabase Storage is removed best-effort
 *     before the row delete; a storage failure does not block the row
 *     delete because the orphaned object can be cleaned up out-of-band.
 *
 * Throws on validation / DB errors (caller surfaces a toast). Redirects on
 * success — server actions can't `return` after `redirect()`.
 */
export async function deleteAudit(auditId: string): Promise<void> {
  if (typeof auditId !== "string" || !auditId) {
    throw new Error("Missing audit id.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const allowed = await consumeRateLimit(
    supabase,
    `audit:delete:${user.id}`,
    MUTATION_MAX,
    MUTATION_WINDOW_S,
  );
  if (!allowed) {
    throw new Error("Too many requests. Please wait a moment and try again.");
  }

  const { data: audit, error: loadErr } = await supabase
    .from("audits")
    .select("id, status, community_id, report_pdf_path")
    .eq("id", auditId)
    .maybeSingle();

  if (loadErr) throw new Error(loadErr.message);
  if (!audit) throw new Error("Audit not found or no access.");

  if (audit.status === "pending" || audit.status === "running") {
    throw new Error(
      "Audit is still running. Cancel it first, then delete.",
    );
  }

  if (audit.report_pdf_path) {
    const { error: storageErr } = await supabase.storage
      .from(REPORT_BUCKET)
      .remove([audit.report_pdf_path]);
    if (storageErr) {
      console.warn("deleteAudit: storage remove failed", {
        auditId,
        path: audit.report_pdf_path,
        message: storageErr.message,
      });
    }
  }

  const { error: deleteErr } = await supabase
    .from("audits")
    .delete()
    .eq("id", auditId);

  if (deleteErr) throw new Error(deleteErr.message);

  if (audit.community_id) {
    revalidatePath(`/communities/${audit.community_id}`);
  }
  revalidatePath("/dashboard");

  if (audit.community_id) {
    redirect(`/communities/${audit.community_id}`);
  }
  redirect("/dashboard");
}
