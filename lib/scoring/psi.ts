import type { AuditCheck, CheckResult } from "@/types";

import { resultFromScore } from "./deterministic";
import { withRetry } from "./_retry";

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PSI_TIMEOUT_MS = 45_000;

interface PsiCategory {
  id: string;
  title: string;
  score: number | null;
  auditRefs?: { id: string; weight?: number; group?: string }[];
}

interface PsiAudit {
  id: string;
  title: string;
  score: number | null;
  scoreDisplayMode?: string;
  description?: string;
  numericValue?: number;
  displayValue?: string;
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, PsiCategory>;
    audits?: Record<string, PsiAudit>;
    finalUrl?: string;
  };
  error?: { message?: string };
}

export interface PsiBuckets {
  seo: AuditCheck[];
  geo: AuditCheck[];
}

function auditRow(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
  score: number,
  meta?: { category?: string; pillar?: "SEO" | "GEO" },
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score,
    ...(meta?.category ? { category: meta.category } : {}),
    ...(meta?.pillar ? { pillar: meta.pillar } : {}),
  };
}

/**
 * Convert PSI categories into AuditCheck rows, distributed across our
 * SEO/GEO buckets. PSI returns scores in [0, 1]; we scale to [0, 100].
 */
function psiCheckFromCategory(
  key: string,
  label: string,
  category: PsiCategory | undefined,
  audits: Record<string, PsiAudit> | undefined,
  meta?: { category?: string; pillar?: "SEO" | "GEO" },
): AuditCheck | null {
  if (!category || category.score === null || category.score === undefined) {
    return null;
  }
  const score = Math.round(category.score * 100);
  const result: CheckResult = resultFromScore(score);

  let detail = "";
  if (audits && category.auditRefs?.length) {
    const failing = category.auditRefs
      .map((ref) => audits[ref.id])
      .filter((a): a is PsiAudit => Boolean(a))
      .filter(
        (a) =>
          a.scoreDisplayMode !== "notApplicable" &&
          a.scoreDisplayMode !== "informative" &&
          (a.score === null || a.score < 0.9),
      )
      .slice(0, 2)
      .map((a) => a.title);
    if (failing.length > 0) {
      detail = ` Top opportunities: ${failing.join("; ")}.`;
    }
  }

  return auditRow(
    key,
    label,
    result,
    `Lighthouse ${label.toLowerCase()} score ${score}/100.${detail}`,
    score,
    meta,
  );
}

function cwvChecks(audits: Record<string, PsiAudit> | undefined): AuditCheck[] {
  if (!audits) return [];
  const out: AuditCheck[] = [];

  const lcp = audits["largest-contentful-paint"];
  if (lcp && typeof lcp.numericValue === "number" && Number.isFinite(lcp.numericValue)) {
    const ms = lcp.numericValue;
    const result: CheckResult = ms <= 2500 ? "pass" : ms <= 4000 ? "warn" : "fail";
    const score = ms <= 2500 ? 100 : ms <= 4000 ? 55 : 15;
    out.push(
      auditRow(
        "psi_lcp",
        "LCP (mobile)",
        result,
        `Largest Contentful Paint ≈ ${Math.round(ms)} ms (target ≤ 2.5 s).${lcp.displayValue ? ` Display: ${lcp.displayValue}.` : ""}`,
        score,
        { category: "Core Web Vitals", pillar: "GEO" },
      ),
    );
  }

  const cls = audits["cumulative-layout-shift"];
  if (cls && typeof cls.numericValue === "number" && Number.isFinite(cls.numericValue)) {
    const v = cls.numericValue;
    const result: CheckResult = v <= 0.1 ? "pass" : v <= 0.25 ? "warn" : "fail";
    const score = v <= 0.1 ? 100 : v <= 0.25 ? 50 : 10;
    out.push(
      auditRow(
        "psi_cls",
        "CLS (mobile)",
        result,
        `Cumulative Layout Shift ≈ ${v.toFixed(3)} (target ≤ 0.1).`,
        score,
        { category: "Core Web Vitals", pillar: "GEO" },
      ),
    );
  }

  const inp = audits["interaction-to-next-paint"];
  if (inp && typeof inp.numericValue === "number" && Number.isFinite(inp.numericValue)) {
    const ms = inp.numericValue;
    const result: CheckResult = ms <= 200 ? "pass" : ms <= 500 ? "warn" : "fail";
    const score = ms <= 200 ? 100 : ms <= 500 ? 50 : 15;
    out.push(
      auditRow(
        "psi_inp",
        "INP (mobile)",
        result,
        `Interaction to Next Paint ≈ ${Math.round(ms)} ms (target ≤ 200 ms).${inp.displayValue ? ` Display: ${inp.displayValue}.` : ""}`,
        score,
        { category: "Core Web Vitals", pillar: "GEO" },
      ),
    );
  }

  const mixed = audits["mixed-content"];
  if (mixed && mixed.scoreDisplayMode !== "notApplicable") {
    const failed = mixed.score === 0;
    out.push(
      auditRow(
        "psi_mixed_content",
        "Mixed content",
        failed ? "fail" : "pass",
        failed
          ? "Lighthouse detected mixed-content or passive mixed-content risks — serve all assets over HTTPS."
          : "No mixed-content audit failures reported.",
        failed ? 0 : 100,
        { category: "Security & quality", pillar: "SEO" },
      ),
    );
  }

  return out;
}

async function fetchPsiStrategy(
  url: string,
  apiKey: string,
  strategy: "mobile" | "desktop",
): Promise<PsiResponse | null> {
  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy,
  });
  for (const cat of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]) {
    params.append("category", cat);
  }

  // One retry on the most common transient failures. PSI returns 429 when
  // we burn through quota and 503 when their backend is overloaded; both
  // recover on the next attempt the vast majority of the time.
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS);
      try {
        const res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (
            res.status === 429 ||
            res.status === 502 ||
            res.status === 503 ||
            res.status === 504
          ) {
            // Throw to let withRetry reschedule.
            throw Object.assign(new Error(`PSI ${res.status}`), {
              status: res.status,
            });
          }
          return null;
        }
        return (await res.json()) as PsiResponse;
      } finally {
        clearTimeout(timer);
      }
    },
    {
      tries: 2,
      backoffMs: 1000,
      retryOn: [429, 502, 503, 504, "AbortError", "ETIMEDOUT", "ECONNRESET"],
    },
  ).catch(() => null);
}

/**
 * Run PageSpeed Insights for one URL. Returns SEO and GEO bucket arrays.
 * No-op (`{ seo: [], geo: [] }`) when PSI_API_KEY is unset, the request
 * times out, or PSI returns an error. Audits never fail because of PSI.
 */
export async function runPsi(url: string): Promise<PsiBuckets> {
  const apiKey = process.env.PSI_API_KEY?.trim();
  if (!apiKey) return { seo: [], geo: [] };

  const json = await fetchPsiStrategy(url, apiKey, "mobile");
  const cats = json?.lighthouseResult?.categories;
  const audits = json?.lighthouseResult?.audits;
  if (!cats) return { seo: [], geo: [] };

  const seo: AuditCheck[] = [];
  const geo: AuditCheck[] = [];

  const seoCheck = psiCheckFromCategory(
    "psi_seo",
    "Lighthouse SEO",
    cats["seo"],
    audits,
    { category: "Lighthouse categories", pillar: "SEO" },
  );
  if (seoCheck) seo.push(seoCheck);

  const bpCheck = psiCheckFromCategory(
    "psi_best_practices",
    "Lighthouse best practices",
    cats["best-practices"],
    audits,
    { category: "Lighthouse categories", pillar: "SEO" },
  );
  if (bpCheck) seo.push(bpCheck);

  const perfCheck = psiCheckFromCategory(
    "psi_performance",
    "Lighthouse performance",
    cats["performance"],
    audits,
    { category: "Lighthouse categories", pillar: "GEO" },
  );
  if (perfCheck) geo.push(perfCheck);

  const a11yCheck = psiCheckFromCategory(
    "psi_accessibility",
    "Lighthouse accessibility",
    cats["accessibility"],
    audits,
    { category: "Lighthouse categories", pillar: "GEO" },
  );
  if (a11yCheck) geo.push(a11yCheck);

  for (const c of cwvChecks(audits)) {
    if (c.key === "psi_mixed_content") seo.push(c);
    else geo.push(c);
  }

  const runDesktop = process.env.PSI_RUN_DESKTOP === "1" || process.env.PSI_DESKTOP === "true";
  if (runDesktop) {
    const desk = await fetchPsiStrategy(url, apiKey, "desktop");
    const dCats = desk?.lighthouseResult?.categories;
    const perf = dCats?.["performance"];
    if (perf && perf.score != null) {
      const score = Math.round(perf.score * 100);
      const result: CheckResult = score >= 90 ? "pass" : score >= 50 ? "warn" : "fail";
      geo.push(
        auditRow(
          "psi_performance_desktop",
          "Desktop Lighthouse performance",
          result,
          `Desktop Lighthouse performance category score ${score}/100 (guide: ≥90 for fast desktop UX).`,
          score,
          { category: "Site performance", pillar: "GEO" },
        ),
      );
    }
  }

  return { seo, geo };
}
