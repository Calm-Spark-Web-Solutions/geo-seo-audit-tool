import * as cheerio from "cheerio";
import type { Element } from "domhandler";

import type { PageFetchMeta } from "@/lib/crawler/fetch";
import { normalizeUrl, sameOrigin } from "@/lib/crawler/normalize";
import type {
  AuditCheck,
  AuditCheckEvidence,
  AuditCheckEvidenceItem,
  CheckResult,
  FixItem,
} from "@/types";

import {
  contentFind,
  contentText,
  isInChrome,
  isInsideContentScope,
  resolveMainContent,
} from "./content-scope";
import { buildPerPageAnalyticsChecks } from "./analytics-tags";
import { structuredDataOfflineHeuristics } from "./schema-heuristic";

/** Hard cap on stored evidence items per check (override via AUDIT_EVIDENCE_MAX_ITEMS). */
function evidenceCap(): number {
  const raw = process.env.AUDIT_EVIDENCE_MAX_ITEMS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 500);
}

export interface DeterministicResult {
  seoChecks: AuditCheck[];
  geoChecks: AuditCheck[];
  fixes: FixItem[];
  /** Unique same-origin URLs (up to 18) for the broken-link probe — avoids a second Cheerio parse. */
  internalLinkTargets: string[];
}

/**
 * Stable score mapping for pass/warn/fail checks. PSI and AI layers compute
 * their own continuous score and call `resultFromScore` instead.
 */
export function scoreFromResult(result: CheckResult): number {
  if (result === "pass") return 100;
  if (result === "warn") return 50;
  return 0;
}

export function resultFromScore(score: number): CheckResult {
  if (score >= 80) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

function check(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
  meta?: {
    category?: string;
    pillar?: "SEO" | "GEO";
    evidence?: AuditCheckEvidence;
  },
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    ...(meta?.category ? { category: meta.category } : {}),
    ...(meta?.pillar ? { pillar: meta.pillar } : {}),
    ...(meta?.evidence && meta.evidence.items.length > 0
      ? { evidence: meta.evidence }
      : {}),
  };
}

/** Collapse whitespace and cap length for check explanations (UI + PDF). */
function snippetForUi(raw: string, maxChars = 180): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxChars - 1))}…`;
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

const KNOWN_SCHEMA_TYPES = new Set([
  "Organization",
  "LocalBusiness",
  "MedicalOrganization",
  "Product",
  "Article",
  "BlogPosting",
  "NewsArticle",
  "FAQPage",
  "HowTo",
  "BreadcrumbList",
  "Event",
  "Person",
  "Place",
  "Service",
  "ProfessionalService",
  "ItemList",
  "Recipe",
  "VideoObject",
  "ImageObject",
  "WebPage",
  "WebSite",
  "AboutPage",
  "ContactPage",
  "Review",
  "AggregateRating",
  "Rating",
]);

const BCP47_LIKE = /^(?:x-default|[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-\d{3})?)$/;

/**
 * Pure-cheerio deterministic checks. No network calls. Stable keys are the
 * contract for the diff layer and the Anthropic rubric.
 */
export interface DeterministicOptions {
  /** When present (audit runner HTML fetch), enables redirect + header checks. */
  fetchMeta?: PageFetchMeta;
}

export function runDeterministicChecks(
  html: string,
  pageUrl: string,
  options?: DeterministicOptions,
): DeterministicResult {
  const $ = cheerio.load(html);
  const contentScope = resolveMainContent($);
  const mainContentText = contentText(contentScope);
  const ldScriptsEarly = $('script[type="application/ld+json"]').toArray();

  // ---------- existing SEO checks ----------

  const titleText = $("title").first().text().trim();
  const titleLen = titleText.length;
  const titleResult: CheckResult =
    titleLen >= 50 && titleLen <= 60
      ? "pass"
      : titleLen === 0
        ? "fail"
        : "warn";
  const titleExplanation =
    titleLen === 0
      ? "Missing <title> tag."
      : titleLen < 50
        ? `Title is short (${titleLen} chars). Aim for roughly 50–60 for primary landing pages.`
        : titleLen > 60
          ? `Title is long (${titleLen} chars). Aim for roughly 50–60 to avoid truncation.`
          : "Title length is in the target band for SERPs.";

  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() ?? "";
  const descLen = metaDesc.length;
  const descResult: CheckResult =
    descLen >= 140 && descLen <= 160
      ? "pass"
      : descLen === 0
        ? "fail"
        : "warn";
  const descExplanation =
    descLen === 0
      ? "Missing meta description."
      : descLen < 140
        ? `Meta description is shorter than the ideal band (${descLen} chars). Aim for roughly 140–160.`
        : descLen > 160
          ? `Meta description is longer than the ideal band (${descLen} chars). Aim for roughly 140–160.`
          : "Meta description length is in the target band.";

  const h1Els = $("h1").toArray();
  const h1Count = h1Els.length;
  const h1Texts = h1Els
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
  const h1Result: CheckResult =
    h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn";
  let h1Explanation =
    h1Count === 0
      ? "No H1 found."
      : h1Count > 1
        ? `Multiple H1s (${h1Count}) can dilute topical focus.`
        : "Exactly one H1.";
  if (h1Count === 1) {
    h1Explanation += h1Texts[0]
      ? ` H1 text: ${JSON.stringify(snippetForUi(h1Texts[0]!))}.`
      : " The H1 element has no visible text.";
  } else if (h1Count > 1) {
    const samples = h1Texts.slice(0, 3).map((t) => JSON.stringify(snippetForUi(t)));
    if (samples.length > 0) {
      h1Explanation += ` Sample H1s: ${samples.join(", ")}`;
      h1Explanation += h1Count > 3 ? ` (+${h1Count - 3} more).` : ".";
    }
  }

  const imgs = $("img");
  let missingAlt = 0;
  const cap = evidenceCap();
  const missingAltItems: AuditCheckEvidenceItem[] = [];
  imgs.each((_, el) => {
    const alt = $(el).attr("alt");
    const isMissing = alt === undefined || alt.trim() === "";
    if (isMissing) {
      missingAlt += 1;
      if (missingAltItems.length < cap) {
        const src = $(el).attr("src")?.trim();
        if (src) {
          const abs = normalizeUrl(src, pageUrl) ?? src;
          const near = $(el).parent().text().replace(/\s+/g, " ").trim();
          missingAltItems.push({
            type: "image",
            src: abs,
            nearText: near ? snippetForUi(near, 120) : undefined,
          });
        }
      }
    }
  });
  const imgResult: CheckResult =
    imgs.length === 0 ? "warn" : missingAlt === 0 ? "pass" : "fail";
  const imgExplanation =
    imgs.length === 0
      ? "No images found (optional for some pages)."
      : missingAlt > 0
        ? `${missingAlt} image(s) missing alt text.`
        : "All images have alt text.";
  const imgEvidence: AuditCheckEvidence | undefined =
    missingAltItems.length > 0
      ? {
          totalCount: missingAlt,
          items: missingAltItems,
          inspector: "images",
        }
      : undefined;

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

  let isHttpsPage = false;
  try {
    isHttpsPage = new URL(pageUrl).protocol === "https:";
  } catch {
    /* ignore */
  }

  const httpSubresources: string[] = [];
  if (isHttpsPage) {
    const pushHttp = (raw: string | undefined) => {
      const v = raw?.trim();
      if (v?.startsWith("http://")) httpSubresources.push(v);
    };
    $("[href],[src],[poster]").each((_, el) => {
      const $el = $(el);
      pushHttp($el.attr("href"));
      pushHttp($el.attr("src"));
      pushHttp($el.attr("poster"));
    });
    $("[srcset]").each((_, el) => {
      const raw = $(el).attr("srcset");
      if (!raw) return;
      for (const part of raw.split(",")) {
        const u = part.trim().split(/\s+/)[0]?.trim();
        if (u?.startsWith("http://")) httpSubresources.push(u);
      }
    });
    $('link[rel="stylesheet"][href]').each((_, el) => {
      pushHttp($(el).attr("href"));
    });
  }
  const mixedUnique = [...new Set(httpSubresources)].slice(0, 25);
  const mixedResult: CheckResult =
    !isHttpsPage ? "pass" : mixedUnique.length === 0 ? "pass" : "fail";
  const mixedExplanation =
    !isHttpsPage
      ? "Mixed-content scan applies to HTTPS pages only."
      : mixedUnique.length === 0
        ? "No obvious http:// subresources in HTML attributes on this HTTPS URL."
        : `${mixedUnique.length} http:// asset reference(s) in HTML — browsers may block active mixed content.`;
  const mixedEvidence: AuditCheckEvidence | undefined =
    mixedUnique.length > 0
      ? {
          totalCount: mixedUnique.length,
          items: mixedUnique.map((u) => ({
            type: "kv" as const,
            label: "http URL",
            value: snippetForUi(u, 200),
          })),
        }
      : undefined;

  // ---------- new SEO checks ----------

  const canonicalHref = $('link[rel="canonical"]').attr("href")?.trim();
  let canonicalResult: CheckResult = "fail";
  let canonicalExplanation = "No <link rel=\"canonical\"> found.";
  if (canonicalHref) {
    const abs = normalizeUrl(canonicalHref, pageUrl);
    if (!abs) {
      canonicalResult = "fail";
      canonicalExplanation = `Canonical href could not be parsed (${canonicalHref}).`;
    } else if (sameOrigin(pageUrl, abs)) {
      canonicalResult = "pass";
      canonicalExplanation = "Canonical link points to a same-origin URL.";
    } else {
      canonicalResult = "warn";
      canonicalExplanation = `Canonical points off-origin (${abs}). Confirm this is intentional.`;
    }
  }

  const viewportMeta = $('meta[name="viewport"]').attr("content")?.trim() ?? "";
  const hasWidthDevice = /width\s*=\s*device-width/i.test(viewportMeta);
  const viewportResult: CheckResult = hasWidthDevice
    ? "pass"
    : viewportMeta
      ? "warn"
      : "fail";
  const viewportExplanation = hasWidthDevice
    ? "Mobile viewport meta tag present."
    : viewportMeta
      ? "Viewport meta is set but missing width=device-width; pages may render zoomed on phones."
      : "Missing <meta name=\"viewport\"> for mobile rendering.";

  const robotsMeta = $('meta[name="robots"]').attr("content")?.toLowerCase() ?? "";
  const googlebotMeta =
    $('meta[name="googlebot"]').attr("content")?.toLowerCase() ?? "";
  const xRobotsHeader =
    options?.fetchMeta?.responseHeadersLower["x-robots-tag"]?.toLowerCase() ?? "";
  const hasNoindex =
    /\bnoindex\b/.test(robotsMeta) ||
    /\bnoindex\b/.test(googlebotMeta) ||
    /\bnoindex\b/.test(xRobotsHeader);
  const hasNofollow =
    /\bnofollow\b/.test(robotsMeta) ||
    /\bnofollow\b/.test(googlebotMeta) ||
    /\bnofollow\b/.test(xRobotsHeader);
  const robotsResult: CheckResult = hasNoindex
    ? "fail"
    : hasNofollow
      ? "warn"
      : "pass";
  let robotsExplanation = "No restrictive robots signals in meta or response headers (default: indexable).";
  if (hasNoindex) {
    const bits: string[] = [];
    if (/\bnoindex\b/.test(robotsMeta)) bits.push("meta robots");
    if (/\bnoindex\b/.test(googlebotMeta)) bits.push("meta googlebot");
    if (/\bnoindex\b/.test(xRobotsHeader)) bits.push("X-Robots-Tag header");
    robotsExplanation = `noindex detected (${bits.join(", ")}); this URL is unlikely to be indexed.`;
  } else if (hasNofollow) {
    robotsExplanation =
      "nofollow detected in robots-related tags — outbound link signals may be limited.";
  } else if (robotsMeta || googlebotMeta || xRobotsHeader) {
    robotsExplanation = `Robots-related directives: ${[robotsMeta, googlebotMeta, xRobotsHeader].filter(Boolean).join(" | ")}`;
  }

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  const ogDesc = $('meta[property="og:description"]').attr("content")?.trim();
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim();
  const ogPresent = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  const ogResult: CheckResult =
    ogPresent === 3 ? "pass" : ogPresent === 0 ? "fail" : "warn";
  const ogExplanation =
    ogPresent === 3
      ? "Open Graph title, description, and image are all set."
      : ogPresent === 0
        ? "No Open Graph tags found; social shares will fall back to defaults."
        : `Found ${ogPresent} of 3 core Open Graph tags (og:title, og:description, og:image).`;

  const twitterCard =
    $('meta[name="twitter:card"]').attr("content")?.trim() ||
    $('meta[property="twitter:card"]').attr("content")?.trim();
  const twitterResult: CheckResult = twitterCard ? "pass" : "warn";
  const twitterExplanation = twitterCard
    ? `Twitter card: ${twitterCard}.`
    : "No twitter:card meta; X / Twitter will use the default summary.";

  const hreflangNodes = $('link[rel="alternate"][hreflang]').toArray();
  let hreflangResult: CheckResult = "warn";
  let hreflangExplanation = "No hreflang alternates declared (fine for single-locale sites).";
  if (hreflangNodes.length > 0) {
    let invalid = 0;
    for (const el of hreflangNodes) {
      const v = $(el).attr("hreflang")?.trim() ?? "";
      if (!BCP47_LIKE.test(v)) invalid += 1;
    }
    if (invalid === 0) {
      hreflangResult = "pass";
      hreflangExplanation = `All ${hreflangNodes.length} hreflang values look well-formed.`;
    } else {
      hreflangResult = "warn";
      hreflangExplanation = `${invalid} of ${hreflangNodes.length} hreflang values are malformed.`;
    }
  }

  const htmlLangRaw = $("html").attr("lang")?.trim() ?? "";
  const htmlLangNorm = htmlLangRaw.replace(/_/g, "-");
  const langResult: CheckResult = htmlLangRaw
    ? BCP47_LIKE.test(htmlLangNorm)
      ? "pass"
      : "warn"
    : "fail";
  const langExplanation = htmlLangRaw
    ? BCP47_LIKE.test(htmlLangNorm)
      ? `Document language declared: lang="${htmlLangRaw}".`
      : `lang="${htmlLangRaw}" may not match a typical BCP 47 pattern; validate.`
    : "Missing <html lang>; declare the primary page language.";

  const breadcrumbDom =
    $(
      'nav[aria-label*="breadcrumb" i], nav[aria-labelledby*="breadcrumb" i], [role="navigation"][aria-label*="breadcrumb" i]',
    ).length > 0;

  const headingLevels = contentFind(contentScope, "h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((el) => parseInt(el.tagName[1], 10));
  let headingSkip = false;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i]! - headingLevels[i - 1]! > 1) {
      headingSkip = true;
      break;
    }
  }
  const hierarchyResult: CheckResult = headingLevels.length === 0
    ? "warn"
    : headingSkip
      ? "warn"
      : "pass";
  const hierarchyExplanation =
    headingLevels.length === 0
      ? "No headings found in the markup."
      : headingSkip
        ? "Heading levels appear to skip (e.g. H2→H4); keep a contiguous outline when possible."
        : "Heading levels progress without skipped ranks.";

  const subheadingEls = contentFind(contentScope, "h2, h3, h4").toArray();
  const h234Count = subheadingEls.length;
  const subheadResult: CheckResult =
    h234Count >= 2 ? "pass" : h234Count === 1 ? "warn" : "fail";
  const subheadExplanation =
    h234Count >= 2
      ? `Found ${h234Count} subordinate headings (H2–H4) for sectional structure.`
      : h234Count === 1
        ? "Only one H2–H4; add more sectional headings where content depth warrants it."
        : "Missing H2–H4 headings; pages often need subheads for skim readers and GEO extraction.";
  const subheadingItems: AuditCheckEvidenceItem[] = subheadingEls
    .slice(0, cap)
    .map((el) => {
      const level = parseInt(el.tagName[1] ?? "2", 10);
      const text = $(el).text().replace(/\s+/g, " ").trim();
      return {
        type: "heading",
        level: (level >= 1 && level <= 6 ? level : 2) as 1 | 2 | 3 | 4 | 5 | 6,
        text: snippetForUi(text, 140),
      };
    });
  const subheadEvidence: AuditCheckEvidence | undefined =
    subheadingItems.length > 0
      ? { totalCount: h234Count, items: subheadingItems }
      : undefined;

  let imgRaster = 0;
  let webpSurface = false;
  $("picture source[type=\"image/webp\"], img[src$=\".webp\"], img[src*=\"format=webp\"], img[srcset*=\".webp\"]").each(
    () => {
      webpSurface = true;
    },
  );
  $("img[src]").each(() => {
    imgRaster += 1;
  });
  const webpResult: CheckResult =
    imgRaster === 0 ? "warn" : webpSurface ? "pass" : "warn";
  const webpExplanation =
    imgRaster === 0
      ? "No raster <img> elements; WebP heuristic skipped."
      : webpSurface
        ? "WebP surfaced via <picture> or .webp URLs; good for bandwidth / LCP when optimized."
        : "No obvious WebP <picture>/<source>/file signals; consider modern responsive images.";

  let urlQueryResult: CheckResult = "pass";
  let urlQueryExplanation =
    "Page URL looks clean relative to heuristic thresholds.";
  try {
    const pu = new URL(pageUrl);
    const qLen = pu.search.length;
    const parts = pu.search.slice(1).split("&").filter(Boolean).length;
    if (qLen > 140 || parts > 12) {
      urlQueryResult = "warn";
      urlQueryExplanation = `Long or busy query string on this URL (${parts} segments, ${qLen} chars). Prefer cleaner canonical URLs where appropriate.`;
    }
  } catch {
    urlQueryExplanation = "Could not parse page URL for query-string heuristic.";
    urlQueryResult = "warn";
  }

  const schemaTypes = new Set<string>();
  let breadcrumbLd = false;
  let napSignals = false;
  let ldParseFailures = 0;
  let totalLdBlocks = 0;
  const ldParsedBlocks: unknown[] = [];

  const walkLd = (node: unknown, onObj: (o: Record<string, unknown>) => void): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const n of node) walkLd(n, onObj);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    onObj(o);
    for (const v of Object.values(o)) walkLd(v, onObj);
  };

  for (const el of ldScriptsEarly) {
    const raw = $(el).html()?.trim();
    if (!raw || raw.length <= 2) continue;
    totalLdBlocks += 1;
    try {
      const parsed = JSON.parse(raw) as unknown;
      ldParsedBlocks.push(parsed);
      walkLd(parsed, (o) => {
        const t = o["@type"];
        const flatTypes: string[] = [];
        if (typeof t === "string") flatTypes.push(t);
        else if (Array.isArray(t)) {
          for (const x of t) if (typeof x === "string") flatTypes.push(x);
        }
        for (const x of flatTypes) {
          schemaTypes.add(x);
          if (x === "BreadcrumbList") breadcrumbLd = true;
        }
        const localish = flatTypes.some(
          (x) => x === "LocalBusiness" || x === "MedicalOrganization",
        );
        if (localish && ("address" in o || typeof o.telephone === "string")) {
          napSignals = true;
        }
      });
    } catch {
      ldParseFailures += 1;
    }
  }

  const offlineSchemaChecks = structuredDataOfflineHeuristics(ldParsedBlocks);

  const navBreadcrumb = breadcrumbDom || breadcrumbLd;
  const crumbResult: CheckResult = navBreadcrumb ? "pass" : "warn";
  const crumbExplanation = breadcrumbDom
    ? "Breadcrumb navigation found in DOM (accessible nav patterns)."
    : breadcrumbLd
      ? "BreadcrumbList present in JSON-LD."
      : "No obvious breadcrumb nav or JSON-LD BreadcrumbList.";

  const titleEvidence: AuditCheckEvidence | undefined = titleLen
    ? {
        items: [
          { type: "kv", label: "Title", value: snippetForUi(titleText, 200) },
          { type: "kv", label: "Length", value: `${titleLen} chars` },
        ],
      }
    : undefined;
  const descEvidence: AuditCheckEvidence | undefined = descLen
    ? {
        items: [
          {
            type: "kv",
            label: "Meta description",
            value: snippetForUi(metaDesc, 240),
          },
          { type: "kv", label: "Length", value: `${descLen} chars` },
        ],
      }
    : undefined;
  const h1Evidence: AuditCheckEvidence | undefined =
    h1Texts.length > 0
      ? {
          totalCount: h1Count,
          items: h1Texts.slice(0, cap).map((text) => ({
            type: "heading",
            level: 1,
            text: snippetForUi(text, 160),
          })),
        }
      : undefined;
  const canonicalEvidence: AuditCheckEvidence | undefined = canonicalHref
    ? {
        items: [
          { type: "kv", label: "Canonical", value: snippetForUi(canonicalHref, 200) },
        ],
      }
    : undefined;
  const ogEvidence: AuditCheckEvidence | undefined =
    ogTitle || ogDesc || ogImage
      ? {
          items: [
            ...(ogTitle
              ? [
                  {
                    type: "kv" as const,
                    label: "og:title",
                    value: snippetForUi(ogTitle, 160),
                  },
                ]
              : []),
            ...(ogDesc
              ? [
                  {
                    type: "kv" as const,
                    label: "og:description",
                    value: snippetForUi(ogDesc, 200),
                  },
                ]
              : []),
            ...(ogImage
              ? [
                  {
                    type: "kv" as const,
                    label: "og:image",
                    value: snippetForUi(ogImage, 200),
                  },
                ]
              : []),
          ],
        }
      : undefined;
  const twitterEvidence: AuditCheckEvidence | undefined = twitterCard
    ? { items: [{ type: "kv", label: "twitter:card", value: twitterCard }] }
    : undefined;
  const viewportEvidence: AuditCheckEvidence | undefined = viewportMeta
    ? { items: [{ type: "kv", label: "viewport", value: viewportMeta }] }
    : undefined;
  const robotsEvidenceItems: AuditCheckEvidenceItem[] = [];
  if (robotsMeta) {
    robotsEvidenceItems.push({ type: "kv", label: "meta robots", value: robotsMeta });
  }
  if (googlebotMeta) {
    robotsEvidenceItems.push({
      type: "kv",
      label: "meta googlebot",
      value: googlebotMeta,
    });
  }
  if (xRobotsHeader) {
    robotsEvidenceItems.push({
      type: "kv",
      label: "X-Robots-Tag",
      value: snippetForUi(xRobotsHeader, 240),
    });
  }
  const robotsEvidence: AuditCheckEvidence | undefined =
    robotsEvidenceItems.length > 0 ? { items: robotsEvidenceItems } : undefined;
  const langEvidence: AuditCheckEvidence | undefined = htmlLangRaw
    ? { items: [{ type: "kv", label: "html lang", value: htmlLangRaw }] }
    : undefined;

  const fetchMetaSeoChecks: AuditCheck[] = [];
  if (options?.fetchMeta) {
    const m = options.fetchMeta;
    let redResult: CheckResult = "pass";
    let redExpl = `Fetched this HTML in ${m.redirectHopCount} redirect hop(s).`;
    if (m.redirectLoop) {
      redResult = "fail";
      redExpl = "Redirect loop detected while fetching this page.";
    } else if (m.redirectHopCount > 5) {
      redResult = "fail";
      redExpl = `Long redirect chain (${m.redirectHopCount} hops) — slows crawlers and users.`;
    } else if (m.redirectHopCount > 2) {
      redResult = "warn";
      redExpl = `${m.redirectHopCount} redirect hop(s) before HTML — simplify chains where possible.`;
    }
    const redItems: AuditCheckEvidenceItem[] = m.redirectChain
      .slice(0, 12)
      .map(
        (h): AuditCheckEvidenceItem => ({
          type: "kv",
          label: `HTTP ${h.status}`,
          value: snippetForUi(h.url, 200),
        }),
      );
    fetchMetaSeoChecks.push(
      check(
        "redirect_chain",
        "Redirect chain (fetch)",
        redResult,
        redExpl,
        {
          category: "Crawlability",
          pillar: "SEO",
          evidence:
            redItems.length > 0
              ? { totalCount: m.redirectChain.length, items: redItems }
              : undefined,
        },
      ),
    );

    const reqN = normalizeUrl(pageUrl);
    const finN = normalizeUrl(m.finalUrl);
    let urlRes: CheckResult = "pass";
    let urlExpl = "Fetched URL matches requested URL after normalization.";
    if (reqN && finN && reqN !== finN) {
      urlRes = "warn";
      urlExpl =
        "Request URL and final URL differ after normalization — confirm redirects and canonicals.";
    } else if (!reqN || !finN) {
      urlRes = "warn";
      urlExpl = "Could not normalize request/final URLs for comparison.";
    }
    const urlItems: AuditCheckEvidenceItem[] = [
      ...(reqN ? [{ type: "kv" as const, label: "Requested", value: reqN }] : []),
      ...(finN ? [{ type: "kv" as const, label: "Final", value: finN }] : []),
    ];
    fetchMetaSeoChecks.push(
      check("fetch_final_url", "Fetched URL vs requested URL", urlRes, urlExpl, {
        category: "Crawlability",
        pillar: "SEO",
        ...(urlItems.length > 0 ? { evidence: { items: urlItems } } : {}),
      }),
    );
  }

  const seoChecks: AuditCheck[] = [
    check("html_lang", "Document language (<html lang>)", langResult, langExplanation, {
      category: "Internationalization",
      pillar: "SEO",
      evidence: langEvidence,
    }),
    check("title_length", "Title tag length", titleResult, titleExplanation, {
      category: "SEO — on-page",
      pillar: "SEO",
      evidence: titleEvidence,
    }),
    check(
      "meta_description",
      "Meta description length",
      descResult,
      descExplanation,
      { category: "SEO — on-page", pillar: "SEO", evidence: descEvidence },
    ),
    check("h1_count", "Single H1", h1Result, h1Explanation, {
      category: "SEO — on-page",
      pillar: "SEO",
      evidence: h1Evidence,
    }),
    check("heading_outline", "Heading level outline", hierarchyResult, hierarchyExplanation, {
      category: "SEO — on-page",
      pillar: "SEO",
      evidence: subheadEvidence,
    }),
    check("subheading_depth", "H2–H4 structure", subheadResult, subheadExplanation, {
      category: "SEO — on-page",
      pillar: "SEO",
      evidence: subheadEvidence,
    }),
    check("breadcrumb_nav", "Breadcrumb navigation", crumbResult, crumbExplanation, {
      category: "SEO — on-page",
      pillar: "SEO",
    }),
    check("webp_surface", "WebP / responsive images", webpResult, webpExplanation, {
      category: "Site performance",
      pillar: "SEO",
    }),
    check("clean_url_query", "URL query string complexity", urlQueryResult, urlQueryExplanation, {
      category: "Crawlability",
      pillar: "SEO",
    }),
    check("img_alt", "Image alt text", imgResult, imgExplanation, {
      category: "Accessibility & media",
      pillar: "GEO",
      evidence: imgEvidence,
    }),
    check("https", "HTTPS", httpsResult, httpsExplanation, {
      category: "Crawlability",
      pillar: "SEO",
    }),
    check(
      "mixed_content_html",
      "Passive mixed content (HTML)",
      mixedResult,
      mixedExplanation,
      {
        category: "Crawlability",
        pillar: "SEO",
        evidence: mixedEvidence,
      },
    ),
    check("canonical", "Canonical link", canonicalResult, canonicalExplanation, {
      category: "Crawlability",
      pillar: "SEO",
      evidence: canonicalEvidence,
    }),
    check("viewport", "Mobile viewport", viewportResult, viewportExplanation, {
      category: "Site performance",
      pillar: "SEO",
      evidence: viewportEvidence,
    }),
    check("robots_meta", "Indexability (robots + headers)", robotsResult, robotsExplanation, {
      category: "Crawlability",
      pillar: "SEO",
      evidence: robotsEvidence,
    }),
    ...fetchMetaSeoChecks,
    check("og_tags", "Open Graph tags", ogResult, ogExplanation, {
      category: "Social metadata",
      pillar: "SEO",
      evidence: ogEvidence,
    }),
    check("twitter_card", "Twitter card", twitterResult, twitterExplanation, {
      category: "Social metadata",
      pillar: "SEO",
      evidence: twitterEvidence,
    }),
    check("hreflang", "hreflang alternates", hreflangResult, hreflangExplanation, {
      category: "Internationalization",
      pillar: "SEO",
    }),
  ];

  // ---------- existing GEO checks ----------

  const words = mainContentText.split(" ").filter(Boolean);
  const wordCount = words.length;
  const wcResult: CheckResult =
    wordCount >= 300 ? "pass" : wordCount >= 150 ? "warn" : "fail";
  const wcExplanation = `About ${wordCount} words in primary content (excluding header, footer, and navigation). GEO-friendly pages often exceed 300 words.`;

  const hasArticleOrMain = $("article").length > 0 || $("main").length > 0;
  const structResult: CheckResult = hasArticleOrMain ? "pass" : "warn";
  const structExplanation = hasArticleOrMain
    ? "Found <article> or <main> landmark for primary content."
    : "No <article> or <main> landmark; consider clearer content hierarchy.";

  let faqResult: CheckResult = "fail";
  let faqExplanation = "No FAQ-style heading found in primary content.";
  const headings = contentFind(contentScope, "h2, h3").toArray();
  for (const el of headings) {
    const t = $(el).text();
    if (/\?/.test(t)) {
      faqResult = "pass";
      faqExplanation =
        "Found a heading in primary content that looks FAQ-style (contains '?').";
      break;
    }
  }

  const jsonLdResult: CheckResult = totalLdBlocks > 0 ? "pass" : "fail";
  const jsonLdExplanation =
    totalLdBlocks > 0
      ? `Found ${totalLdBlocks} application/ld+json block(s).`
      : "No JSON-LD structured data found.";

  const ldSyntaxResult: CheckResult =
    totalLdBlocks === 0 ? "pass" : ldParseFailures === 0 ? "pass" : "fail";
  const ldSyntaxExplanation =
    totalLdBlocks === 0
      ? "No JSON-LD blocks to validate."
      : ldParseFailures > 0
        ? `${ldParseFailures} of ${totalLdBlocks} JSON-LD block(s) failed JSON parse — fix malformed scripts.`
        : "All JSON-LD blocks parse as valid JSON.";

  // Score and sample in-content links only (primary content scope, not chrome).
  const MAX_PROBE_TARGETS = 18;
  let contentLinks = 0;
  let chromeLinks = 0;
  const seenContentHrefs = new Set<string>();
  const seenChromeHrefs = new Set<string>();
  const linkItems: AuditCheckEvidenceItem[] = [];
  const chromeLinkItems: AuditCheckEvidenceItem[] = [];
  const internalLinkTargets: string[] = [];

  const pushLinkSample = (
    items: AuditCheckEvidenceItem[],
    seen: Set<string>,
    abs: string,
    el: Element,
  ) => {
    if (seen.has(abs) || items.length >= cap) return;
    seen.add(abs);
    const anchor = $(el).text().replace(/\s+/g, " ").trim();
    const rel = $(el).attr("rel")?.trim();
    items.push({
      type: "link",
      url: abs,
      anchor: anchor ? snippetForUi(anchor, 120) : undefined,
      ...(rel ? { rel } : {}),
    });
  };

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = normalizeUrl(href, pageUrl);
    if (!abs || !sameOrigin(pageUrl, abs)) return;

    const inChrome = isInChrome($, el);
    const inContent =
      !inChrome && isInsideContentScope(contentScope, el);

    if (inContent) {
      contentLinks += 1;
      pushLinkSample(linkItems, seenContentHrefs, abs, el);
      if (
        internalLinkTargets.length < MAX_PROBE_TARGETS &&
        !internalLinkTargets.includes(abs)
      ) {
        internalLinkTargets.push(abs);
      }
    } else {
      chromeLinks += 1;
      pushLinkSample(chromeLinkItems, seenChromeHrefs, abs, el);
    }
  });

  const linkResult: CheckResult =
    contentLinks >= 5 ? "pass" : contentLinks >= 2 ? "warn" : "fail";
  const navOnlyNote =
    contentLinks === 0 && chromeLinks > 0
      ? " All internal links are in navigation, header, footer, or outside primary content; add contextual in-body links to related pages."
      : "";
  const linkExplanation =
    `Found ${contentLinks} in-content internal link(s) and ${chromeLinks} in navigation/header/footer or outside primary content. Aim for at least 5 in-content links for strong internal linking.` +
    navOnlyNote;
  const linkEvidence: AuditCheckEvidence | undefined =
    linkItems.length > 0 || chromeLinkItems.length > 0
      ? {
          totalCount: contentLinks,
          items: linkItems,
          ...(chromeLinks > 0
            ? {
                chromeTotalCount: chromeLinks,
                chromeItems: chromeLinkItems,
              }
            : {}),
          inspector: "links",
        }
      : undefined;

  // ---------- structured data (granular) ----------

  const knownHits = [...schemaTypes].filter((t) => KNOWN_SCHEMA_TYPES.has(t));
  const structuredCoverageResult: CheckResult =
    totalLdBlocks === 0
      ? "fail"
      : knownHits.length > 0
        ? "pass"
        : "warn";
  const structuredCoverageExplanation =
    totalLdBlocks === 0
      ? "Add JSON-LD for key entities (Organization, WebSite, services, FAQs)."
      : knownHits.length > 0
        ? `Detected recognized schema types: ${knownHits.slice(0, 8).join(", ")}${knownHits.length > 8 ? ", …" : ""}.`
        : "JSON-LD present but none of our watched schema.org @types surfaced — review markup.";

  const schemaTypeItems: AuditCheckEvidenceItem[] = [...schemaTypes]
    .sort()
    .slice(0, cap)
    .map((schemaType) => ({ type: "schema", schemaType }));
  const schemaEvidence: AuditCheckEvidence | undefined =
    schemaTypeItems.length > 0
      ? {
          totalCount: schemaTypes.size,
          items: schemaTypeItems,
          inspector: "schema",
        }
      : undefined;

  const hasOrgFamily = schemaTypes.has("Organization")
    || schemaTypes.has("LocalBusiness")
    || schemaTypes.has("MedicalOrganization");

  const orgCheck = check(
    "schema_organization_family",
    "Schema: Organization / local entity",
    hasOrgFamily ? "pass" : totalLdBlocks > 0 ? "warn" : "fail",
    hasOrgFamily
      ? "Found Organization, LocalBusiness, and/or MedicalOrganization markup."
      : totalLdBlocks > 0
        ? "Consider Organization or LocalBusiness / MedicalOrganization for brand-location clarity."
        : "No Organization-style entity JSON-LD detected.",
    {
      category: "Structured data",
      pillar: "GEO",
      evidence: schemaEvidence,
    },
  );

  const hasWebSite = schemaTypes.has("WebSite");
  const siteCheck = check(
    "schema_website",
    "Schema: WebSite",
    hasWebSite ? "pass" : totalLdBlocks > 0 ? "warn" : "fail",
    hasWebSite
      ? "WebSite schema present (ideal for sitelinks / searchAction patterns)."
      : "No WebSite JSON-LD; add sitewide WebSite with publisher linkage when possible.",
    {
      category: "Structured data",
      pillar: "GEO",
      evidence: schemaEvidence,
    },
  );

  const hasServiceFaq = schemaTypes.has("Service") || schemaTypes.has("FAQPage");
  const svcFaqCheck = check(
    "schema_service_faq",
    "Schema: Service or FAQPage",
    hasServiceFaq ? "pass" : totalLdBlocks > 0 ? "warn" : "fail",
    hasServiceFaq
      ? "Service and/or FAQPage schema detected for rich-result-friendly pages."
      : "Add Service and/or FAQPage JSON-LD on relevant templates.",
    {
      category: "Structured data",
      pillar: "GEO",
      evidence: schemaEvidence,
    },
  );

  const hasArticle = schemaTypes.has("Article")
    || schemaTypes.has("BlogPosting")
    || schemaTypes.has("NewsArticle");
  const articleCheck = check(
    "schema_article",
    "Schema: Article / BlogPosting",
    hasArticle ? "pass" : "warn",
    hasArticle
      ? "Article-style schema present for editorial content surfaces."
      : "No Article/BlogPosting schema; add for news/blog templates if applicable.",
    {
      category: "Structured data",
      pillar: "GEO",
      evidence: schemaEvidence,
    },
  );

  const hasItemList = schemaTypes.has("ItemList");
  const itemListCheck = check(
    "schema_item_list",
    "Schema: ItemList",
    hasItemList ? "pass" : "warn",
    hasItemList
      ? "ItemList markup found (often used for catalogs / listings)."
      : "No ItemList schema; optional for programmatic listing hubs.",
    {
      category: "Structured data",
      pillar: "GEO",
      evidence: schemaEvidence,
    },
  );

  const napCheck = check(
    "schema_nap_signals",
    "Schema: NAP / contact hints",
    napSignals ? "pass" : totalLdBlocks > 0 ? "warn" : "fail",
    napSignals
      ? "Local/Medical organization JSON-LD includes address or telephone signals."
      : "Enhance LocalBusiness/MedicalOrganization blocks with structured address + phone when relevant.",
    {
      category: "Structured data",
      pillar: "GEO",
      evidence: schemaEvidence,
    },
  );

  const titleLower = titleText.toLowerCase();
  const h1Text = $("h1").first().text().trim().toLowerCase();
  const lowerBody = mainContentText.toLowerCase();
  const titleTokens = titleLower
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  let entityHits = 0;
  if (h1Text && titleTokens.some((t) => h1Text.includes(t))) entityHits += 1;
  if (lowerBody && titleTokens.some((t) => lowerBody.includes(t))) entityHits += 1;
  let entityResult: CheckResult;
  let entityExplanation: string;
  if (titleTokens.length === 0) {
    entityResult = "warn";
    entityExplanation = "Title is too short to derive an entity signal.";
  } else if (entityHits === 2) {
    entityResult = "pass";
    entityExplanation = "Title keywords appear in both H1 and body content.";
  } else if (entityHits === 1) {
    entityResult = "warn";
    entityExplanation = "Title keywords appear in either H1 or body, but not both.";
  } else {
    entityResult = "fail";
    entityExplanation = "Title keywords are not echoed in the H1 or body.";
  }

  const listCount =
    contentFind(contentScope, "ul").length + contentFind(contentScope, "ol").length;
  const qaHeadingEls = headings.filter((el) => /\?/.test($(el).text()));
  const qaHeadings = qaHeadingEls.length;
  let lqResult: CheckResult;
  let lqExplanation: string;
  if (listCount >= 2 && qaHeadings >= 1) {
    lqResult = "pass";
    lqExplanation = `Found ${listCount} list(s) and ${qaHeadings} Q&A heading(s); content is AI-extractable.`;
  } else if (listCount + qaHeadings >= 1) {
    lqResult = "warn";
    lqExplanation = `Found ${listCount} list(s) and ${qaHeadings} Q&A heading(s); add more for stronger AI extractability.`;
  } else {
    lqResult = "fail";
    lqExplanation = "No bullet/numbered lists or Q&A headings; AI surfaces struggle to extract structured answers.";
  }
  const lqItems: AuditCheckEvidenceItem[] = [
    { type: "kv", label: "Lists (ul/ol)", value: String(listCount) },
    { type: "kv", label: "Q&A headings", value: String(qaHeadings) },
    ...qaHeadingEls.slice(0, cap - 2).map((el): AuditCheckEvidenceItem => {
      const level = parseInt(el.tagName[1] ?? "2", 10);
      const text = $(el).text().replace(/\s+/g, " ").trim();
      return {
        type: "heading",
        level: (level >= 1 && level <= 6 ? level : 2) as 1 | 2 | 3 | 4 | 5 | 6,
        text: snippetForUi(text, 140),
      };
    }),
  ];
  const lqEvidence: AuditCheckEvidence = {
    items: lqItems,
  };

  let faqMatchedText: string | null = null;
  let faqMatchedLevel: 1 | 2 | 3 | 4 | 5 | 6 = 2;
  if (qaHeadingEls.length > 0) {
    const first = qaHeadingEls[0]!;
    faqMatchedText = $(first).text().replace(/\s+/g, " ").trim();
    const lvl = parseInt(first.tagName[1] ?? "2", 10);
    faqMatchedLevel = (lvl >= 1 && lvl <= 6 ? lvl : 2) as 1 | 2 | 3 | 4 | 5 | 6;
  }
  const faqEvidence: AuditCheckEvidence | undefined = faqMatchedText
    ? {
        items: [
          {
            type: "heading",
            level: faqMatchedLevel,
            text: snippetForUi(faqMatchedText, 140),
          },
        ],
      }
    : undefined;

  // ---------- outbound authority links ----------

  const AUTHORITY_SIGNALS = [".gov", ".edu", "schema.org", "google.com", "nih.gov", "cdc.gov", "aarp.org"];
  let externalLinkCount = 0;
  let authorityLinkCount = 0;
  const externalLinkItems: AuditCheckEvidenceItem[] = [];
  $("a[href]").each((_, el) => {
    if (isInChrome($, el)) return;
    const href = $(el).attr("href");
    if (!href) return;
    const abs = normalizeUrl(href, pageUrl);
    if (!abs || sameOrigin(pageUrl, abs)) return;
    externalLinkCount += 1;
    const isAuthority = AUTHORITY_SIGNALS.some((sig) => abs.includes(sig));
    if (isAuthority) authorityLinkCount += 1;
    if (externalLinkItems.length < 25) {
      const anchor = $(el).text().replace(/\s+/g, " ").trim();
      externalLinkItems.push({
        type: "link",
        url: snippetForUi(abs, 200),
        anchor: anchor ? snippetForUi(anchor, 80) : undefined,
      });
    }
  });
  const outboundResult: CheckResult =
    authorityLinkCount > 0
      ? "pass"
      : "warn";
  const outboundExplanation =
    externalLinkCount === 0
      ? "No external outbound links found; linking to authoritative sources signals trust to AI crawlers."
      : authorityLinkCount > 0
        ? `Found ${authorityLinkCount} outbound link(s) to authoritative domains (.gov/.edu or known authority sites) out of ${externalLinkCount} external link(s).`
        : `Found ${externalLinkCount} external link(s) but none to authority domains (.gov, .edu, schema.org, etc.); consider citing authoritative sources.`;
  const outboundEvidence: AuditCheckEvidence | undefined =
    externalLinkItems.length > 0
      ? { totalCount: externalLinkCount, items: externalLinkItems }
      : undefined;

  // ---------- semantic HTML elements ----------

  const semanticTagCounts: Record<string, number> = {
    nav: $("nav").length,
    main: $("main").length,
    article: $("article").length,
    section: $("section").length,
    aside: $("aside").length,
    header: $("header").length,
    footer: $("footer").length,
  };
  const semanticTagsPresent = Object.values(semanticTagCounts).filter((v) => v > 0).length;
  const semanticHtmlResult: CheckResult =
    semanticTagsPresent >= 4 ? "pass" : semanticTagsPresent >= 2 ? "warn" : "fail";
  const semanticHtmlExplanation =
    semanticTagsPresent >= 4
      ? `${semanticTagsPresent} of 7 semantic HTML5 element types present; strong structural signal for AI parsers.`
      : semanticTagsPresent >= 2
        ? `Only ${semanticTagsPresent} of 7 semantic HTML5 element types present (nav, main, article, section, aside, header, footer); add more for richer AI-parseable structure.`
        : `${semanticTagsPresent} semantic HTML5 element type(s) found; pages with minimal semantic structure are harder for AI crawlers to interpret.`;
  const semanticHtmlEvidence: AuditCheckEvidence = {
    totalCount: semanticTagsPresent,
    items: Object.entries(semanticTagCounts)
      .filter(([, v]) => v > 0)
      .map(([tag, count]) => ({ type: "kv" as const, label: `<${tag}>`, value: String(count) })),
  };

  // ---------- acronym <abbr> usage ----------

  const abbrCount = contentFind(contentScope, "abbr").length;
  const abbrResult: CheckResult = abbrCount > 0 ? "pass" : "warn";
  const abbrExplanation =
    abbrCount > 0
      ? `Found ${abbrCount} <abbr> element(s); defined acronyms help AI crawlers parse technical terms correctly.`
      : "No <abbr> elements found; defining acronyms with <abbr title> improves AI understanding of specialized terminology.";
  const abbrEvidence: AuditCheckEvidence | undefined =
    abbrCount > 0
      ? { items: [{ type: "kv", label: "<abbr> count", value: String(abbrCount) }] }
      : undefined;

  // ---------- summary / takeaways block ----------

  const summaryClassPattern = /\b(summary|takeaway|key[-_]point|tldr|quick[-_]fact|highlights?)\b/i;
  const summaryByClass =
    contentScope
      .find("[class]")
      .filter((_, el) => {
        const cls = $(el).attr("class") ?? "";
        return summaryClassPattern.test(cls);
      }).length > 0;
  const summaryByAside =
    contentFind(contentScope, "aside").filter((_, el) => {
      return $(el).find("ul, ol").length > 0;
    }).length > 0;
  const hasSummaryBlock = summaryByClass || summaryByAside;
  const summaryResult: CheckResult = hasSummaryBlock ? "pass" : "warn";
  const summaryExplanation = hasSummaryBlock
    ? "Summary or key-takeaways block detected; great for AI snippet extraction and reader scannability."
    : "No obvious summary or key-takeaways block found; adding a brief bullet-point summary near the top helps AI models extract the page's core message.";

  // ---------- schema: AboutPage ----------

  const hasAboutPage = schemaTypes.has("AboutPage");
  const aboutPageCheck = check(
    "schema_about_page",
    "Schema: AboutPage",
    hasAboutPage ? "pass" : "warn",
    hasAboutPage
      ? "AboutPage schema present; clearly defines the page as an entity description."
      : "No AboutPage schema; add on the /about page to signal brand-entity information to AI crawlers.",
    { category: "Structured data", pillar: "GEO", evidence: schemaEvidence },
  );

  // ---------- schema: ProfessionalService ----------

  const hasProfService = schemaTypes.has("ProfessionalService");
  const profServiceCheck = check(
    "schema_professional_service",
    "Schema: ProfessionalService",
    hasProfService ? "pass" : "warn",
    hasProfService
      ? "ProfessionalService schema present; positions the business as a B2B service provider."
      : "No ProfessionalService schema; add on service pages to signal the agency as a professional B2B provider.",
    { category: "Structured data", pillar: "GEO", evidence: schemaEvidence },
  );

  let pathLower = "";
  try {
    pathLower = new URL(pageUrl).pathname.toLowerCase();
  } catch {
    /* ignore */
  }
  const looksEditorial =
    /\/(blog|news|articles|insights)(\/|$)/i.test(pathLower);
  let thinBlogResult: CheckResult = "pass";
  let thinBlogExplanation =
    "URL path is not classified as blog/news/articles/insights for the thin-content heuristic.";
  if (looksEditorial) {
    if (wordCount >= 320 && h234Count >= 2) {
      thinBlogResult = "pass";
      thinBlogExplanation =
        "Editorial-style URL with reasonable word count and subheading structure.";
    } else {
      thinBlogResult = "warn";
      thinBlogExplanation = `Editorial-style URL path (${pathLower}) shows relatively low depth (~${wordCount} words, ${h234Count} H2–H4) — consider richer guidance for readers and AI citations.`;
    }
  }
  const thinBlogEvidence: AuditCheckEvidence | undefined =
    looksEditorial && (wordCount < 320 || h234Count < 2)
      ? {
          items: [
            { type: "kv", label: "Words", value: String(wordCount) },
            { type: "kv", label: "H2–H4", value: String(h234Count) },
          ],
        }
      : undefined;

  const geoChecks: AuditCheck[] = [
    check("word_count", "Content depth (word count)", wcResult, wcExplanation, {
      category: "Content readiness",
      pillar: "GEO",
    }),
    check(
      "blog_editorial_depth",
      "Blog / editorial depth (heuristic)",
      thinBlogResult,
      thinBlogExplanation,
      {
        category: "Content readiness",
        pillar: "GEO",
        evidence: thinBlogEvidence,
      },
    ),
    check(
      "semantic_landmarks",
      "Semantic landmarks",
      structResult,
      structExplanation,
      { category: "Content readiness", pillar: "GEO" },
    ),
    check(
      "semantic_html_elements",
      "Semantic HTML5 elements",
      semanticHtmlResult,
      semanticHtmlExplanation,
      { category: "Content readiness", pillar: "GEO", evidence: semanticHtmlEvidence },
    ),
    check("faq_heading", "FAQ-style heading", faqResult, faqExplanation, {
      category: "Content readiness",
      pillar: "GEO",
      evidence: faqEvidence,
    }),
    check(
      "summary_block",
      "Summary / key-takeaways block",
      summaryResult,
      summaryExplanation,
      { category: "Content readiness", pillar: "GEO" },
    ),
    check(
      "acronym_abbr_usage",
      "Acronym definitions (<abbr>)",
      abbrResult,
      abbrExplanation,
      { category: "Content readiness", pillar: "GEO", evidence: abbrEvidence },
    ),
    check(
      "outbound_authority_links",
      "Outbound authority links",
      outboundResult,
      outboundExplanation,
      { category: "Content readiness", pillar: "GEO", evidence: outboundEvidence },
    ),
    check("json_ld", "Structured data (JSON-LD)", jsonLdResult, jsonLdExplanation, {
      category: "Structured data",
      pillar: "GEO",
    }),
    check(
      "json_ld_syntax",
      "JSON-LD parses cleanly",
      ldSyntaxResult,
      ldSyntaxExplanation,
      { category: "Structured data", pillar: "GEO" },
    ),
    check(
      "structured_data_coverage",
      "Structured data coverage (@types)",
      structuredCoverageResult,
      structuredCoverageExplanation,
      {
        category: "Structured data",
        pillar: "GEO",
        evidence: schemaEvidence,
      },
    ),
    orgCheck,
    siteCheck,
    svcFaqCheck,
    articleCheck,
    itemListCheck,
    aboutPageCheck,
    profServiceCheck,
    napCheck,
    ...offlineSchemaChecks,
    check("internal_links", "Internal links", linkResult, linkExplanation, {
      category: "Internal linking",
      pillar: "GEO",
      evidence: linkEvidence,
    }),
    check(
      "entity_consistency",
      "Entity consistency",
      entityResult,
      entityExplanation,
      { category: "Topic alignment", pillar: "GEO" },
    ),
    check(
      "lists_and_qa",
      "Lists and Q&A",
      lqResult,
      lqExplanation,
      {
        category: "Extractability",
        pillar: "GEO",
        evidence: lqEvidence,
      },
    ),
  ];

  // ---------- crawl budget URL heuristic ----------

  const CRAWL_WASTE_PATTERNS = [
    /[?&](tag|s|category|paged)=/i,
    /\/page\/\d+\//i,
    /\/(archive|tag|category)(\/|$)/i,
    /[?&]p=\d+(?:&|$)/i,
  ];
  const crawlWasteMatches = CRAWL_WASTE_PATTERNS.filter((p) => p.test(pageUrl));
  const crawlBudgetResult: CheckResult = crawlWasteMatches.length === 0 ? "pass" : "warn";
  const crawlBudgetExplanation =
    crawlBudgetResult === "pass"
      ? "URL does not match common crawl-budget-waste patterns (tags, archives, pagination)."
      : `URL matches thin/paginated content patterns (${crawlWasteMatches.length} signal(s) — e.g. /page/N/, /tag/, ?s=); consider noindex or canonical to preserve crawl budget.`;
  seoChecks.push(
    check("crawl_budget_url", "Crawl budget URL heuristic", crawlBudgetResult, crawlBudgetExplanation, {
      category: "Crawlability",
      pillar: "SEO",
    }),
  );

  // ---------- thin page detector ----------

  const veryThinAndIndexed = !hasNoindex && wordCount < 150;
  const thinAndIndexed = !hasNoindex && wordCount < 300;
  const thinPageResult: CheckResult = veryThinAndIndexed ? "fail" : thinAndIndexed ? "warn" : "pass";
  const thinPageExplanation = veryThinAndIndexed
    ? `Very low word count (~${wordCount} words) on an indexable page — thin content may be penalised or ignored by search engines. Add content or apply noindex.`
    : thinAndIndexed
      ? `Below-target word count (~${wordCount} words) on an indexable page. Consider expanding content or adding noindex if this URL is not meant to rank.`
      : hasNoindex
        ? `Page is marked noindex — thin-content depth check skipped (intentional exclusion).`
        : `Indexable page has adequate content depth (~${wordCount} words).`;
  seoChecks.push(
    check("thin_page_indexed", "Thin page (indexed)", thinPageResult, thinPageExplanation, {
      category: "Content readiness",
      pillar: "SEO",
    }),
  );

  seoChecks.push(...buildPerPageAnalyticsChecks(html));

  const fixes = [...fixesFromChecks(seoChecks), ...fixesFromChecks(geoChecks)];

  return { seoChecks, geoChecks, fixes, internalLinkTargets };
}
