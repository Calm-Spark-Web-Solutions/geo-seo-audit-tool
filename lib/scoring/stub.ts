import * as cheerio from "cheerio";

import { normalizeUrl, sameOrigin } from "@/lib/crawler/normalize";
import type { AuditCheck, CheckResult, FixItem } from "@/types";

export interface StubPageScore {
  score: number;
  seoScore: number;
  geoScore: number;
  seoChecks: AuditCheck[];
  geoChecks: AuditCheck[];
  fixes: FixItem[];
}

function check(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
): AuditCheck {
  return { key, label, result, explanation };
}

function categoryScore(checks: AuditCheck[]): number {
  if (checks.length === 0) return 0;
  let points = 0;
  for (const c of checks) {
    if (c.result === "pass") points += 1;
    else if (c.result === "warn") points += 0.5;
  }
  return Math.round((points / checks.length) * 100);
}

function fixesFromChecks(checks: AuditCheck[]): FixItem[] {
  const out: FixItem[] = [];
  for (const c of checks) {
    if (c.result === "fail") {
      out.push({
        priority: "high",
        title: c.label,
        detail: c.explanation,
      });
    } else if (c.result === "warn") {
      out.push({
        priority: "medium",
        title: c.label,
        detail: c.explanation,
      });
    }
  }
  return out;
}

/**
 * Deterministic SEO + GEO checks for stub audits (no LLM).
 */
export function scorePage(html: string, pageUrl: string): StubPageScore {
  const $ = cheerio.load(html);

  const titleText = $("title").first().text().trim();
  const titleLen = titleText.length;
  const titleResult: CheckResult =
    titleLen >= 10 && titleLen <= 60
      ? "pass"
      : titleLen === 0
        ? "fail"
        : "warn";
  const titleExplanation =
    titleLen === 0
      ? "Missing <title> tag."
      : titleLen < 10
        ? `Title is very short (${titleLen} chars). Aim for 10–60.`
        : titleLen > 60
          ? `Title is long (${titleLen} chars). Aim for 10–60.`
          : "Title length looks good for SERPs.";

  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() ?? "";
  const descLen = metaDesc.length;
  const descResult: CheckResult =
    descLen >= 50 && descLen <= 160
      ? "pass"
      : descLen === 0
        ? "fail"
        : "warn";
  const descExplanation =
    descLen === 0
      ? "Missing meta description."
      : descLen < 50
        ? `Meta description is short (${descLen} chars). Aim for 50–160.`
        : descLen > 160
          ? `Meta description is long (${descLen} chars). Aim for 50–160.`
          : "Meta description length is in a good range.";

  const h1Count = $("h1").length;
  const h1Result: CheckResult =
    h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn";
  const h1Explanation =
    h1Count === 0
      ? "No H1 found."
      : h1Count > 1
        ? `Multiple H1s (${h1Count}) can dilute topical focus.`
        : "Exactly one H1.";

  const imgs = $("img");
  let missingAlt = 0;
  imgs.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined || alt.trim() === "") missingAlt += 1;
  });
  const imgResult: CheckResult =
    imgs.length === 0 ? "warn" : missingAlt === 0 ? "pass" : "fail";
  const imgExplanation =
    imgs.length === 0
      ? "No images found (optional for some pages)."
      : missingAlt > 0
        ? `${missingAlt} image(s) missing alt text.`
        : "All images have alt text.";

  let httpsResult: CheckResult = "fail";
  let httpsExplanation = "Could not parse page URL.";
  try {
    const u = new URL(pageUrl);
    httpsResult = u.protocol === "https:" ? "pass" : "warn";
    httpsExplanation =
      u.protocol === "https:"
        ? "Page is served over HTTPS."
        : "Page is not served over HTTPS (prefer HTTPS everywhere).";
  } catch {
    /* keep fail */
  }

  const seoChecks: AuditCheck[] = [
    check("title_length", "Title tag length", titleResult, titleExplanation),
    check("meta_description", "Meta description", descResult, descExplanation),
    check("h1_count", "Single H1", h1Result, h1Explanation),
    check("img_alt", "Image alt text", imgResult, imgExplanation),
    check("https", "HTTPS", httpsResult, httpsExplanation),
  ];

  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript").remove();
  const words = bodyClone
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const wordCount = words.length;
  const wcResult: CheckResult =
    wordCount >= 300 ? "pass" : wordCount >= 150 ? "warn" : "fail";
  const wcExplanation = `About ${wordCount} words visible in main content. GEO-friendly pages often exceed 300 words.`;

  const hasArticleOrMain =
    $("article").length > 0 || $("main").length > 0;
  const structResult: CheckResult = hasArticleOrMain ? "pass" : "warn";
  const structExplanation = hasArticleOrMain
    ? "Found <article> or <main> landmark for primary content."
    : "No <article> or <main> landmark; consider clearer content hierarchy.";

  let faqResult: CheckResult = "fail";
  let faqExplanation = "No FAQ-style heading found.";
  const headings = $("h2, h3").toArray();
  for (const el of headings) {
    const t = $(el).text();
    if (/\?/.test(t)) {
      faqResult = "pass";
      faqExplanation =
        "Found a heading that looks FAQ-style (contains '?').";
      break;
    }
  }

  let jsonLdResult: CheckResult = "fail";
  let jsonLdExplanation = "No JSON-LD structured data found.";
  const ldScripts = $('script[type="application/ld+json"]').toArray();
  for (const el of ldScripts) {
    const raw = $(el).html()?.trim();
    if (raw && raw.length > 2) {
      jsonLdResult = "pass";
      jsonLdExplanation = "Found application/ld+json structured data.";
      break;
    }
  }

  let internalLinks = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = normalizeUrl(href, pageUrl);
    if (abs && sameOrigin(pageUrl, abs)) internalLinks += 1;
  });
  const linkResult: CheckResult =
    internalLinks >= 5 ? "pass" : internalLinks >= 2 ? "warn" : "fail";
  const linkExplanation = `Found ${internalLinks} internal link(s) to the same site. Aim for at least 5 for strong internal linking.`;

  const geoChecks: AuditCheck[] = [
    check("word_count", "Content depth (word count)", wcResult, wcExplanation),
    check("semantic_landmarks", "Semantic landmarks", structResult, structExplanation),
    check("faq_heading", "FAQ-style heading", faqResult, faqExplanation),
    check("json_ld", "Structured data (JSON-LD)", jsonLdResult, jsonLdExplanation),
    check("internal_links", "Internal links", linkResult, linkExplanation),
  ];

  const seoScore = categoryScore(seoChecks);
  const geoScore = categoryScore(geoChecks);
  const score = Math.round((seoScore + geoScore) / 2);
  const fixes = [...fixesFromChecks(seoChecks), ...fixesFromChecks(geoChecks)];

  return {
    score,
    seoScore,
    geoScore,
    seoChecks,
    geoChecks,
    fixes,
  };
}
