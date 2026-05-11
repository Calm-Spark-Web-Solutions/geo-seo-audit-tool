import type { AuditCheck, FixItem } from "@/types";

import {
  generatePageAnalysis,
  type AnthropicAnalysis,
} from "./anthropic-scores";
import { runDeterministicChecks, scoreFromResult } from "./deterministic";
import { runPsi } from "./psi";

export interface PageScore {
  score: number;
  seoScore: number;
  geoScore: number;
  seoChecks: AuditCheck[];
  geoChecks: AuditCheck[];
  fixes: FixItem[];
  aiComment: string | null;
}

/**
 * Average a category's per-check score into a 0..100 number. Falls back to
 * the result-derived score for legacy checks that did not persist `score`.
 */
function categoryScore(checks: AuditCheck[]): number {
  if (checks.length === 0) return 0;
  let sum = 0;
  for (const c of checks) {
    sum += typeof c.score === "number" ? c.score : scoreFromResult(c.result);
  }
  return Math.round(sum / checks.length);
}

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
 * Layered audit engine: deterministic cheerio checks, optional Google PSI,
 * optional Anthropic analysis. Each layer is independent — failures degrade gracefully.
 */
export async function scoreAndAnalyzePage({
  url,
  html,
}: {
  url: string;
  html: string;
}): Promise<PageScore> {
  const det = runDeterministicChecks(html, url);

  // PSI and Anthropic run concurrently; Anthropic consumes deterministic
  // summaries only so the call shape stays cache-friendly.
  const [psi, ai]: [
    Awaited<ReturnType<typeof runPsi>>,
    AnthropicAnalysis,
  ] = await Promise.all([
    runPsi(url),
    generatePageAnalysis({
      url,
      html,
      seoChecks: det.seoChecks,
      geoChecks: det.geoChecks,
      fixes: det.fixes,
    }),
  ]);

  const seoChecks: AuditCheck[] = [...det.seoChecks, ...psi.seo];
  const geoChecks: AuditCheck[] = [...det.geoChecks, ...psi.geo, ...ai.geo];

  const seoScore = categoryScore(seoChecks);
  const geoScore = categoryScore(geoChecks);
  const score = Math.round((seoScore + geoScore) / 2);

  // Recompute fixes against the merged check arrays so PSI/AI failures
  // surface in the suggested-fixes list too.
  const fixes = [...fixesFromChecks(seoChecks), ...fixesFromChecks(geoChecks)];

  return {
    score,
    seoScore,
    geoScore,
    seoChecks,
    geoChecks,
    fixes,
    aiComment: ai.comment,
  };
}
