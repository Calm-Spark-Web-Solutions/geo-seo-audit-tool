import type { AuditCheck, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

export interface AnalyticsTagDetection {
  hasGa4: boolean;
  hasGtm: boolean;
  measurementIds: string[];
}

const GA4_ID_RE = /\bG-[A-Z0-9]{6,12}\b/g;
const GTM_ID_RE = /\bGTM-[A-Z0-9]+\b/g;

/** Detect GA4 measurement IDs and GTM container IDs in raw HTML. */
export function detectAnalyticsTagsInHtml(html: string): AnalyticsTagDetection {
  const measurementIds = [
    ...new Set((html.match(GA4_ID_RE) ?? []).map((id) => id.toUpperCase())),
  ];
  const gtmIds = [...new Set(html.match(GTM_ID_RE) ?? [])];
  const hasGa4 =
    measurementIds.length > 0 ||
    /googletagmanager\.com\/gtag\/js/i.test(html) ||
    /gtag\s*\(\s*['"]config['"]/i.test(html);
  const hasGtm =
    gtmIds.length > 0 || /googletagmanager\.com\/gtm\.js/i.test(html);
  return {
    hasGa4,
    hasGtm,
    measurementIds,
  };
}

function siteCheck(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    category: "Analytics",
    pillar: "SEO",
  };
}

export interface AnalyticsPageInput {
  url: string;
  html: string;
}

/**
 * Site-wide rollup: GA4 / GTM presence across scored pages in the scan.
 */
export function buildAnalyticsSiteWideChecks(
  pages: AnalyticsPageInput[],
): AuditCheck[] {
  if (pages.length === 0) return [];

  let withGa4 = 0;
  let withGtm = 0;
  const ids = new Set<string>();

  for (const p of pages) {
    const det = detectAnalyticsTagsInHtml(p.html);
    if (det.hasGa4) withGa4 += 1;
    if (det.hasGtm) withGtm += 1;
    for (const id of det.measurementIds) ids.add(id);
  }

  const n = pages.length;
  const ga4Result: CheckResult =
    withGa4 === n ? "pass" : withGa4 > 0 ? "warn" : "fail";
  const ga4Explanation =
    withGa4 === 0
      ? "No GA4 measurement ID or gtag.js detected on any scored page in this scan."
      : withGa4 === n
        ? `GA4 tag detected on all ${n} scored pages.`
        : `GA4 tag detected on ${withGa4} of ${n} scored pages.`;

  const checks: AuditCheck[] = [
    siteCheck("ga4_measurement_id", "GA4 tag (site-wide)", ga4Result, ga4Explanation),
  ];

  if (withGa4 === 0 && withGtm === 0) {
    checks.push(
      siteCheck(
        "google_tag_manager",
        "Google Tag Manager",
        "warn",
        "Neither GA4 nor Google Tag Manager detected on scored pages. Confirm analytics is installed.",
      ),
    );
  } else if (withGtm > 0) {
    checks.push(
      siteCheck(
        "google_tag_manager",
        "Google Tag Manager",
        withGtm === n ? "pass" : "warn",
        `GTM detected on ${withGtm} of ${n} scored pages.`,
      ),
    );
  }

  if (ids.size > 0) {
    const sample = [...ids].slice(0, 5).join(", ");
    checks[0] = {
      ...checks[0],
      explanation: `${checks[0].explanation} IDs seen: ${sample}${ids.size > 5 ? "…" : ""}.`,
    };
  }

  return checks;
}

/** Per-page deterministic checks (merged into seo_checks). */
export function buildPerPageAnalyticsChecks(html: string): AuditCheck[] {
  const det = detectAnalyticsTagsInHtml(html);
  const result: CheckResult = det.hasGa4
    ? "pass"
    : det.hasGtm
      ? "warn"
      : "fail";
  const explanation = det.hasGa4
    ? det.measurementIds.length
      ? `GA4 measurement ID detected (${det.measurementIds.join(", ")}).`
      : "GA4 gtag configuration detected in page HTML."
    : det.hasGtm
      ? "GTM container detected but no GA4 measurement ID found in HTML (tags may load client-side)."
      : "No GA4 measurement ID or GTM container detected in page HTML.";

  return [
    {
      key: "ga4_measurement_id",
      label: "GA4 measurement ID",
      result,
      explanation,
      score: scoreFromResult(result),
      category: "Analytics",
      pillar: "SEO",
    },
  ];
}
