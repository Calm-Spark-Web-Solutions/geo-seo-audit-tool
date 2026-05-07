import { pdf } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AuditReportPdfDocument } from "@/lib/pdf/report";
import type { Audit, AuditPage, Community, Company } from "@/types";

export interface AuditPdfPayload {
  audit: Audit;
  pages: AuditPage[];
  community: Community | null;
  company: Company | null;
}

/**
 * Loads the audit, its pages, the parent community, and the company in a
 * single RLS-aware fetch. Returns null when the audit is not visible to the
 * caller (so route handlers can surface a 404).
 */
export async function loadAuditPdfPayload(
  supabase: SupabaseClient,
  auditId: string,
): Promise<AuditPdfPayload | null> {
  const { data: audit, error: auditErr } = await supabase
    .from("audits")
    .select(
      "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, report_pdf_path, report_generated_at, created_at",
    )
    .eq("id", auditId)
    .maybeSingle();

  if (auditErr || !audit) return null;

  const [{ data: pages }, { data: community }] = await Promise.all([
    supabase
      .from("audit_pages")
      .select(
        "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, created_at",
      )
      .eq("audit_id", audit.id)
      .order("score", { ascending: false, nullsFirst: false }),
    supabase
      .from("communities")
      .select("id, company_id, name, website_url, created_at")
      .eq("id", audit.community_id)
      .maybeSingle(),
  ]);

  let company: Company | null = null;
  if (community) {
    const { data: companyRow } = await supabase
      .from("companies")
      .select(
        "id, user_id, name, logo_url, contact_name, contact_email, notes, created_at",
      )
      .eq("id", community.company_id)
      .maybeSingle();
    company = (companyRow as Company | null) ?? null;
  }

  return {
    audit: audit as Audit,
    pages: (pages ?? []) as AuditPage[],
    community: (community as Community | null) ?? null,
    company,
  };
}

/**
 * Renders the report PDF to a Node Buffer. Must run on the Node.js runtime;
 * `@react-pdf/renderer` is not Edge-compatible.
 */
export async function renderAuditPdfBuffer(
  payload: AuditPdfPayload,
): Promise<Buffer> {
  const instance = pdf(
    <AuditReportPdfDocument
      audit={payload.audit}
      community={payload.community}
      company={payload.company}
      pages={payload.pages}
    />,
  );
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
