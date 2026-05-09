import * as cheerio from "cheerio";

import { normalizeUrl, sameOrigin } from "@/lib/crawler/normalize";
import type { AuditCheck, CheckResult, FixItem } from "@/types";

import { structuredDataOfflineHeuristics } from "./schema-heuristic";

export interface DeterministicResult {
  seoChecks: AuditCheck[];
  geoChecks: AuditCheck[];
  fixes: FixItem[];
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
  meta?: { category?: string; pillar?: "SEO" | "GEO" },
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    ...(meta?.category ? { category: meta.category } : {}),
    ...(meta?.pillar ? { pillar: meta.pillar } : {}),
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
  "ItemList",
  "Recipe",
  "VideoObject",
  "ImageObject",
  "WebPage",
  "WebSite",
  "AboutPage",
  "ContactPage",
]);

const BCP47_LIKE = /^(?:x-default|[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-\d{3})?)$/;

/**
 * Pure-cheerio deterministic checks. No network calls. Stable keys are the
 * contract for the diff layer and the Anthropic rubric.
 */
export function runDeterministicChecks(
  html: string,
  pageUrl: string,
): DeterministicResult {
  const $ = cheerio.load(html);
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
  let titleExplanation =
    titleLen === 0
      ? "Missing <title> tag."
      : titleLen < 50
        ? `Title is short (${titleLen} chars). Aim for roughly 50–60 for primary landing pages.`
        : titleLen > 60
          ? `Title is long (${titleLen} chars). Aim for roughly 50–60 to avoid truncation.`
          : "Title length is in the target band for SERPs.";
  if (titleLen > 0) {
    titleExplanation += ` Current title: ${JSON.stringify(snippetForUi(titleText))}.`;
  }

  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() ?? "";
  const descLen = metaDesc.length;
  const descResult: CheckResult =
    descLen >= 140 && descLen <= 160
      ? "pass"
      : descLen === 0
        ? "fail"
        : "warn";
  let descExplanation =
    descLen === 0
      ? "Missing meta description."
      : descLen < 140
        ? `Meta description is shorter than the ideal band (${descLen} chars). Aim for roughly 140–160.`
        : descLen > 160
          ? `Meta description is longer than the ideal band (${descLen} chars). Aim for roughly 140–160.`
          : "Meta description length is in the target band.";
  if (descLen > 0) {
    descExplanation += ` Current meta description: ${JSON.stringify(snippetForUi(metaDesc))}.`;
  }

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
  const hasNoindex = /\bnoindex\b/.test(robotsMeta);
  const hasNofollow = /\bnofollow\b/.test(robotsMeta);
  const robotsResult: CheckResult = hasNoindex
    ? "fail"
    : hasNofollow
      ? "warn"
      : "pass";
  const robotsExplanation = hasNoindex
    ? "robots meta contains noindex; this page will not be indexed."
    : hasNofollow
      ? "robots meta contains nofollow; outbound link signals are dropped."
      : robotsMeta
        ? `robots meta: ${robotsMeta}`
        : "No restrictive robots meta tag (default: indexable).";

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

  const headingLevels = $("h1, h2, h3, h4, h5, h6")
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

  const h234Count = $("h2, h3, h4").length;
  const subheadResult: CheckResult =
    h234Count >= 2 ? "pass" : h234Count === 1 ? "warn" : "fail";
  const subheadExplanation =
    h234Count >= 2
      ? `Found ${h234Count} subordinate headings (H2–H4) for sectional structure.`
      : h234Count === 1
        ? "Only one H2–H4; add more sectional headings where content depth warrants it."
        : "Missing H2–H4 headings; pages often need subheads for skim readers and GEO extraction.";

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

  const seoChecks: AuditCheck[] = [
    check("html_lang", "Document language (<html lang>)", langResult, langExplanation, {
      category: "Internationalization",
      pillar: "SEO",
    }),
    check("title_length", "Title tag length", titleResult, titleExplanation, {
      category: "SEO — on-page",
      pillar: "SEO",
    }),
    check(
      "meta_description",
      "Meta description length",
      descResult,
      descExplanation,
      { category: "SEO — on-page", pillar: "SEO" },
    ),
    check("h1_count", "Single H1", h1Result, h1Explanation, {
      category: "SEO — on-page",
      pillar: "SEO",
    }),
    check("heading_outline", "Heading level outline", hierarchyResult, hierarchyExplanation, {
      category: "SEO — on-page",
      pillar: "SEO",
    }),
    check("subheading_depth", "H2–H4 structure", subheadResult, subheadExplanation, {
      category: "SEO — on-page",
      pillar: "SEO",
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
    }),
    check("https", "HTTPS", httpsResult, httpsExplanation, {
      category: "Crawlability",
      pillar: "SEO",
    }),
    check("canonical", "Canonical link", canonicalResult, canonicalExplanation, {
      category: "Crawlability",
      pillar: "SEO",
    }),
    check("viewport", "Mobile viewport", viewportResult, viewportExplanation, {
      category: "Site performance",
      pillar: "SEO",
    }),
    check("robots_meta", "Robots meta", robotsResult, robotsExplanation, {
      category: "Crawlability",
      pillar: "SEO",
    }),
    check("og_tags", "Open Graph tags", ogResult, ogExplanation, {
      category: "Social metadata",
      pillar: "SEO",
    }),
    check("twitter_card", "Twitter card", twitterResult, twitterExplanation, {
      category: "Social metadata",
      pillar: "SEO",
    }),
    check("hreflang", "hreflang alternates", hreflangResult, hreflangExplanation, {
      category: "Internationalization",
      pillar: "SEO",
    }),
  ];

  // ---------- existing GEO checks ----------

  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript").remove();
  const bodyText = bodyClone.text().replace(/\s+/g, " ").trim();
  const words = bodyText.split(" ").filter(Boolean);
  const wordCount = words.length;
  const wcResult: CheckResult =
    wordCount >= 300 ? "pass" : wordCount >= 150 ? "warn" : "fail";
  const wcExplanation = `About ${wordCount} words visible in main content. GEO-friendly pages often exceed 300 words.`;

  const hasArticleOrMain = $("article").length > 0 || $("main").length > 0;
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
      faqExplanation = "Found a heading that looks FAQ-style (contains '?').";
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
    { category: "Structured data", pillar: "GEO" },
  );

  const hasWebSite = schemaTypes.has("WebSite");
  const siteCheck = check(
    "schema_website",
    "Schema: WebSite",
    hasWebSite ? "pass" : totalLdBlocks > 0 ? "warn" : "fail",
    hasWebSite
      ? "WebSite schema present (ideal for sitelinks / searchAction patterns)."
      : "No WebSite JSON-LD; add sitewide WebSite with publisher linkage when possible.",
    { category: "Structured data", pillar: "GEO" },
  );

  const hasServiceFaq = schemaTypes.has("Service") || schemaTypes.has("FAQPage");
  const svcFaqCheck = check(
    "schema_service_faq",
    "Schema: Service or FAQPage",
    hasServiceFaq ? "pass" : totalLdBlocks > 0 ? "warn" : "fail",
    hasServiceFaq
      ? "Service and/or FAQPage schema detected for rich-result-friendly pages."
      : "Add Service and/or FAQPage JSON-LD on relevant templates.",
    { category: "Structured data", pillar: "GEO" },
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
    { category: "Structured data", pillar: "GEO" },
  );

  const hasItemList = schemaTypes.has("ItemList");
  const itemListCheck = check(
    "schema_item_list",
    "Schema: ItemList",
    hasItemList ? "pass" : "warn",
    hasItemList
      ? "ItemList markup found (often used for catalogs / listings)."
      : "No ItemList schema; optional for programmatic listing hubs.",
    { category: "Structured data", pillar: "GEO" },
  );

  const napCheck = check(
    "schema_nap_signals",
    "Schema: NAP / contact hints",
    napSignals ? "pass" : totalLdBlocks > 0 ? "warn" : "fail",
    napSignals
      ? "Local/Medical organization JSON-LD includes address or telephone signals."
      : "Enhance LocalBusiness/MedicalOrganization blocks with structured address + phone when relevant.",
    { category: "Structured data", pillar: "GEO" },
  );

  const titleLower = titleText.toLowerCase();
  const h1Text = $("h1").first().text().trim().toLowerCase();
  const lowerBody = bodyText.toLowerCase();
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

  const listCount = $("ul").length + $("ol").length;
  const qaHeadings = headings.filter((el) => /\?/.test($(el).text())).length;
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

  const figures = $("figure").length;
  const captions = $("figcaption").length;
  let captionResult: CheckResult;
  let captionExplanation: string;
  if (imgs.length === 0) {
    captionResult = "warn";
    captionExplanation = "No images on this page.";
  } else if (captions > 0 && figures > 0) {
    captionResult = "pass";
    captionExplanation = `Found ${captions} figure caption(s) attached to ${figures} <figure> element(s).`;
  } else {
    captionResult = "warn";
    captionExplanation = "Images present but no <figcaption>; captions help AI summaries cite images.";
  }

  const geoChecks: AuditCheck[] = [
    check("word_count", "Content depth (word count)", wcResult, wcExplanation, {
      category: "Content readiness",
      pillar: "GEO",
    }),
    check(
      "semantic_landmarks",
      "Semantic landmarks",
      structResult,
      structExplanation,
      { category: "Content readiness", pillar: "GEO" },
    ),
    check("faq_heading", "FAQ-style heading", faqResult, faqExplanation, {
      category: "Content readiness",
      pillar: "GEO",
    }),
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
      { category: "Structured data", pillar: "GEO" },
    ),
    orgCheck,
    siteCheck,
    svcFaqCheck,
    articleCheck,
    itemListCheck,
    napCheck,
    ...offlineSchemaChecks,
    check("internal_links", "Internal links", linkResult, linkExplanation, {
      category: "Internal linking",
      pillar: "GEO",
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
      { category: "Extractability", pillar: "GEO" },
    ),
    check(
      "images_with_captions",
      "Images with captions",
      captionResult,
      captionExplanation,
      { category: "Accessibility & media",
      pillar: "GEO",
    }),
  ];

  const fixes = [...fixesFromChecks(seoChecks), ...fixesFromChecks(geoChecks)];

  return { seoChecks, geoChecks, fixes };
}
