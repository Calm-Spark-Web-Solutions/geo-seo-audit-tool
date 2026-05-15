import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";

import { COMMUNITY_MANUAL_ITEMS } from "@/lib/checklists/community-manual";
import { AuditReportPdfDocument, type PdfReportVariant } from "@/lib/pdf/report";
import type {
  Audit,
  AuditPage,
  AuditCheck,
  Community,
  CommunityManualResults,
  Company,
  ManualChecklistPdfRow,
} from "@/types";

export interface AuditPdfPayload {
  audit: Audit;
  pages: AuditPage[];
  community: Community | null;
  company: Company | null;
  siteWideChecks: AuditCheck[];
  cruxFieldChecks: AuditCheck[];
  manualChecklistRows: ManualChecklistPdfRow[];
}

function buildManualPdfRows(community: Community | null): ManualChecklistPdfRow[] {
  const saved: CommunityManualResults = community?.manual_check_results ?? {};
  return COMMUNITY_MANUAL_ITEMS.map((item) => ({
    key: item.key,
    category: item.category,
    label: item.label,
    helper: item.helper,
    status: saved[item.key]?.status ?? "unreviewed",
    notes: (saved[item.key]?.notes ?? "").trim(),
  }));
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
      "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, site_wide_checks, crux_field_checks, report_pdf_path, report_generated_at, created_at",
    )
    .eq("id", auditId)
    .maybeSingle();

  if (auditErr || !audit) return null;

  const [{ data: pages }, { data: community }] = await Promise.all([
    supabase
      .from("audit_pages")
      .select(
        "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, sitemap_category_label, created_at",
      )
      .eq("audit_id", audit.id)
      .order("score", { ascending: false, nullsFirst: false }),
    supabase
      .from("communities")
      .select(
        "id, company_id, name, website_url, facility_type, manual_check_results, created_at",
      )
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

  const typedAudit = audit as Audit;
  const sw = typedAudit.site_wide_checks;
  const siteWideChecks = Array.isArray(sw) ? (sw as AuditCheck[]) : [];
  const cr = typedAudit.crux_field_checks;
  const cruxFieldChecks = Array.isArray(cr) ? (cr as AuditCheck[]) : [];
  const typedCommunity = (community as Community | null) ?? null;

  return {
    audit: typedAudit,
    pages: (pages ?? []) as AuditPage[],
    community: typedCommunity,
    company,
    siteWideChecks,
    cruxFieldChecks,
    manualChecklistRows: buildManualPdfRows(typedCommunity),
  };
}

/**
 * Renders the report PDF to a Node Buffer. Must run on the Node.js runtime;
 * `@react-pdf/renderer` is not Edge-compatible.
 */
export async function renderAuditPdfBuffer(
  payload: AuditPdfPayload,
  options?: { variant?: PdfReportVariant },
): Promise<Buffer> {
  const variant = options?.variant ?? "full";
  return renderToBuffer(
    <AuditReportPdfDocument
      audit={payload.audit}
      community={payload.community}
      company={payload.company}
      pages={payload.pages}
      siteWideChecks={payload.siteWideChecks}
      cruxFieldChecks={payload.cruxFieldChecks}
      variant={variant}
    />,
  );
}
