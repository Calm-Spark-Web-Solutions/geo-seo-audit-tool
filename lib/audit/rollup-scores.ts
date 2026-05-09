import type { SupabaseClient } from "@supabase/supabase-js";

import {
  categoryScoreEffective,
  overallPageScoreFromChecks,
} from "@/lib/scoring/effective-scores";
import type { AuditCheck } from "@/types";

/**
 * Recompute `audits.score`, `seo_score`, `geo_score` from all `audit_pages`
 * rows, skipping URLs with `exclude_from_audit_score` and pages whose
 * effective overall score is null (no checks counting toward score).
 */
export async function recalculateAuditRollupScores(
  supabase: SupabaseClient,
  auditId: string,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("audit_pages")
    .select("exclude_from_audit_score, seo_results, geo_results")
    .eq("audit_id", auditId);

  if (error) throw new Error(error.message);

  let seoSum = 0;
  let seoN = 0;
  let geoSum = 0;
  let geoN = 0;
  let totalSum = 0;
  let totalN = 0;

  for (const row of rows ?? []) {
    if (row.exclude_from_audit_score ?? false) continue;
    const seo = (row.seo_results ?? []) as AuditCheck[];
    const geo = (row.geo_results ?? []) as AuditCheck[];
    const s = categoryScoreEffective(seo);
    const g = categoryScoreEffective(geo);
    const t = overallPageScoreFromChecks(seo, geo);
    if (s != null) {
      seoSum += s;
      seoN += 1;
    }
    if (g != null) {
      geoSum += g;
      geoN += 1;
    }
    if (t != null) {
      totalSum += t;
      totalN += 1;
    }
  }

  await supabase
    .from("audits")
    .update({
      seo_score: seoN > 0 ? Math.round(seoSum / seoN) : null,
      geo_score: geoN > 0 ? Math.round(geoSum / geoN) : null,
      score: totalN > 0 ? Math.round(totalSum / totalN) : null,
    })
    .eq("id", auditId);
}
