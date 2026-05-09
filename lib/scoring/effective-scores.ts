import type { AuditCheck, FixItem } from "@/types";

import { scoreFromResult } from "./deterministic";

function fixesFromChecks(checks: AuditCheck[]): FixItem[] {
  const out: FixItem[] = [];
  for (const c of checks) {
    if (c.result === "fail") {
      out.push({ priority: "high", title: c.label, detail: c.explanation });
    } else if (c.result === "warn") {
      out.push({ priority: "medium", title: c.label, detail: c.explanation });
    }
  }
  return out;
}

/**
 * Checks that still count toward SEO/GEO category scores. Per-check
 * `excludeFromScore` is a manual override on stored audit_pages JSON.
 */
export function checksCountingTowardScore(checks: AuditCheck[]): AuditCheck[] {
  return checks.filter((c) => !c.excludeFromScore);
}

export function categoryScoreEffective(checks: AuditCheck[]): number | null {
  const active = checksCountingTowardScore(checks);
  if (active.length === 0) return null;
  let sum = 0;
  for (const c of active) {
    sum += typeof c.score === "number" ? c.score : scoreFromResult(c.result);
  }
  return Math.round(sum / active.length);
}

/**
 * Overall page score from effective pillar scores (null pillar ignored).
 */
export function overallPageScoreFromChecks(
  seo: AuditCheck[],
  geo: AuditCheck[],
): number | null {
  const s = categoryScoreEffective(seo);
  const g = categoryScoreEffective(geo);
  if (s != null && g != null) return Math.round((s + g) / 2);
  if (s != null) return s;
  if (g != null) return g;
  return null;
}

/** Fixes list still uses all checks so reviewers see every issue. */
export function mergeFixesFromAllChecks(
  seo: AuditCheck[],
  geo: AuditCheck[],
) {
  return [...fixesFromChecks(seo), ...fixesFromChecks(geo)];
}
