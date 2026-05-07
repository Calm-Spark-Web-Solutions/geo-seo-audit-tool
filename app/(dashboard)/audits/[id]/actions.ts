"use server";

import { revalidatePath } from "next/cache";

import { loadAuditPdfPayload, renderAuditPdfBuffer } from "@/lib/pdf/render";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "audit-reports";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 5;

export type SavePdfState = {
  ok: boolean;
  error?: string;
  path?: string;
  generatedAt?: string;
};

export type SignedUrlState = {
  ok: boolean;
  error?: string;
  url?: string;
};

function objectKey(auditId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `audits/${auditId}/${stamp}.pdf`;
}

export async function savePdfToStorage(
  _prev: SavePdfState,
  formData: FormData,
): Promise<SavePdfState> {
  const auditId = formData.get("audit_id");
  if (typeof auditId !== "string" || !auditId) {
    return { ok: false, error: "Missing audit." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const payload = await loadAuditPdfPayload(supabase, auditId);
  if (!payload) {
    return { ok: false, error: "Audit not found or no access." };
  }

  let buffer: Buffer;
  try {
    buffer = await renderAuditPdfBuffer(payload);
  } catch {
    return { ok: false, error: "Failed to render PDF." };
  }

  const key = objectKey(auditId);

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upload.error) {
    return {
      ok: false,
      error: upload.error.message ?? "Failed to upload PDF.",
    };
  }

  const generatedAt = new Date().toISOString();
  const update = await supabase
    .from("audits")
    .update({
      report_pdf_path: key,
      report_generated_at: generatedAt,
    })
    .eq("id", auditId);

  if (update.error) {
    return {
      ok: false,
      error: update.error.message ?? "Failed to record PDF path.",
    };
  }

  revalidatePath(`/audits/${auditId}`);
  revalidatePath(`/audits/${auditId}/export`);

  return {
    ok: true,
    path: key,
    generatedAt,
  };
}

export async function getSignedReportUrl(
  _prev: SignedUrlState,
  formData: FormData,
): Promise<SignedUrlState> {
  const auditId = formData.get("audit_id");
  if (typeof auditId !== "string" || !auditId) {
    return { ok: false, error: "Missing audit." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: audit, error: auditErr } = await supabase
    .from("audits")
    .select("id, report_pdf_path")
    .eq("id", auditId)
    .maybeSingle();

  if (auditErr || !audit) {
    return { ok: false, error: "Audit not found or no access." };
  }
  if (!audit.report_pdf_path) {
    return { ok: false, error: "No saved PDF for this audit." };
  }

  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(audit.report_pdf_path, SIGNED_URL_EXPIRY_SECONDS);

  if (signed.error || !signed.data?.signedUrl) {
    return {
      ok: false,
      error: signed.error?.message ?? "Failed to create signed URL.",
    };
  }

  return { ok: true, url: signed.data.signedUrl };
}
