import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type {
  Audit,
  AuditCheck,
  AuditCheckEvidence,
  AuditPage,
} from "@/types";

export interface InspectorPageContext {
  audit: Pick<
    Audit,
    "id" | "community_id" | "status" | "created_at" | "score"
  >;
  page: AuditPage;
  /** Merged SEO + GEO checks for the page. */
  checks: AuditCheck[];
  /** Raw SEO check rows from the page. */
  seo: AuditCheck[];
  /** Raw GEO check rows from the page. */
  geo: AuditCheck[];
}

/**
 * Load the audit + page row required for an inspector subroute and 404 when
 * the audit/page is missing. RLS already filters by the authed user.
 */
export async function loadInspectorContext(opts: {
  auditId: string;
  pageId: string;
}): Promise<InspectorPageContext> {
  const { auditId, pageId } = opts;
  const supabase = await createClient();
  const [{ data: audit }, { data: page }] = await Promise.all([
    supabase
      .from("audits")
      .select("id, community_id, status, created_at, score")
      .eq("id", auditId)
      .maybeSingle(),
    supabase
      .from("audit_pages")
      .select(
        "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, exclude_from_audit_score, created_at",
      )
      .eq("id", pageId)
      .eq("audit_id", auditId)
      .maybeSingle(),
  ]);
  if (!audit || !page) notFound();

  const seo = ((page.seo_results ?? []) as AuditCheck[]) ?? [];
  const geo = ((page.geo_results ?? []) as AuditCheck[]) ?? [];
  return {
    audit: audit as InspectorPageContext["audit"],
    page: page as AuditPage,
    checks: [...seo, ...geo],
    seo,
    geo,
  };
}

/** Compact pass/warn/fail counts for an array of checks. */
export function tallyChecks(checks: AuditCheck[]): {
  pass: number;
  warn: number;
  fail: number;
} {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of checks) {
    if (c.result === "pass") pass += 1;
    else if (c.result === "warn") warn += 1;
    else fail += 1;
  }
  return { pass, warn, fail };
}

/**
 * Find the first check that produced evidence for a given inspector. We pick
 * the highest-signal row (e.g. `internal_links`) but fall back to any check
 * declaring `evidence.inspector === inspector`.
 */
export function findInspectorEvidence(
  checks: AuditCheck[],
  inspector: "links" | "images" | "schema" | "lighthouse",
  preferredKeys: readonly string[] = [],
): { check: AuditCheck; evidence: AuditCheckEvidence } | null {
  const eligible = checks.filter(
    (c): c is AuditCheck & { evidence: AuditCheckEvidence } =>
      Boolean(c.evidence && c.evidence.inspector === inspector),
  );
  if (eligible.length === 0) return null;
  for (const key of preferredKeys) {
    const match = eligible.find((c) => c.key === key);
    if (match) return { check: match, evidence: match.evidence };
  }
  const first = eligible[0]!;
  return { check: first, evidence: first.evidence };
}
