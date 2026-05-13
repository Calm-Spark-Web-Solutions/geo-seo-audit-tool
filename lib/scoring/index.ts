import type { PageFetchMeta } from "@/lib/crawler/fetch";
import type { AuditCheck, FixItem } from "@/types";

import { probeBrokenInternalLinks } from "./broken-internal-links";

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

function enrichFixesWithGuidance(checks: AuditCheck[], fixes: FixItem[]): FixItem[] {
  const byLabel = new Map<string, AuditCheck>();
  for (const c of checks) {
    byLabel.set(c.label, c);
  }
  return fixes.map((f) => {
    const c = byLabel.get(f.title);
    const lines = c?.evidence?.guidanceLines?.filter((l) => l.trim());
    if (!lines?.length) return f;
    const extra =
      "\n\nSuggested next steps:\n" +
      lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
    return { ...f, detail: `${f.detail}${extra}` };
  });
}

/**
 * Layered audit engine: deterministic cheerio checks, optional Google PSI,
 * optional Anthropic analysis. Each layer is independent — failures degrade gracefully.
 */
export async function scoreAndAnalyzePage({
  url,
  html,
  fetchMeta,
}: {
  url: string;
  html: string;
  fetchMeta?: PageFetchMeta;
}): Promise<PageScore> {
  const det = runDeterministicChecks(html, url, { fetchMeta });

  // PSI, Anthropic, and internal-link probes run concurrently.
  const [psi, ai, brokenCheck]: [
    Awaited<ReturnType<typeof runPsi>>,
    AnthropicAnalysis,
    AuditCheck,
  ] = await Promise.all([
    runPsi(url),
    generatePageAnalysis({
      url,
      html,
      seoChecks: det.seoChecks,
      geoChecks: det.geoChecks,
      fixes: det.fixes,
    }),
    probeBrokenInternalLinks(html, url),
  ]);

  const seoChecks: AuditCheck[] = [...det.seoChecks, ...psi.seo, brokenCheck];
  const geoChecks: AuditCheck[] = [...det.geoChecks, ...psi.geo, ...ai.geo];

  const seoScore = categoryScore(seoChecks);
  const geoScore = categoryScore(geoChecks);
  const score = Math.round((seoScore + geoScore) / 2);

  // Recompute fixes against the merged check arrays so PSI/AI failures
  // surface in the suggested-fixes list too.
  const fixes = enrichFixesWithGuidance(
    [...seoChecks, ...geoChecks],
    [...fixesFromChecks(seoChecks), ...fixesFromChecks(geoChecks)],
  );

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
