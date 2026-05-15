import * as cheerio from "cheerio";

import { normalizeUrl } from "@/lib/crawler/normalize";

export interface SocialPreviewChips {
  titleFound: boolean;
  descriptionFound: boolean;
  imageFound: boolean;
  /** True when og:title, og:description, and og:image (or og:image:url) are all present in markup. */
  ogCoreComplete: boolean;
}

export interface SocialPreviewMeta {
  title: string;
  description: string;
  imageUrl: string | null;
  /** Brand line above title on some cards (og:site_name or hostname). */
  siteName: string;
  /** URL string shown on link previews (og:url, canonical, or final fetch URL). */
  displayUrl: string;
  twitterCard: string | null;
  chips: SocialPreviewChips;
}

function trimMeta(raw: string | undefined): string {
  return raw?.replace(/\s+/g, " ").trim() ?? "";
}

function firstMetaContent(
  $: cheerio.CheerioAPI,
  selector: string,
): string {
  return trimMeta($(selector).first().attr("content"));
}

function resolveAbsoluteImage(raw: string, baseUrl: string): string | null {
  const t = trimMeta(raw);
  if (!t) return null;
  return normalizeUrl(t, baseUrl);
}

/**
 * Parse HTML for Open Graph, Twitter, and baseline SEO fields used by social / SERP mockups.
 */
export function extractSocialPreviewMeta(
  html: string,
  finalUrl: string,
): SocialPreviewMeta {
  const $ = cheerio.load(html);

  const ogTitleRaw = firstMetaContent($, 'meta[property="og:title"]');
  const ogDescRaw = firstMetaContent($, 'meta[property="og:description"]');
  const ogImageRaw =
    firstMetaContent($, 'meta[property="og:image"]') ||
    firstMetaContent($, 'meta[property="og:image:url"]');

  const twitterTitleRaw =
    firstMetaContent($, 'meta[name="twitter:title"]') ||
    firstMetaContent($, 'meta[property="twitter:title"]');
  const twitterDescRaw =
    firstMetaContent($, 'meta[name="twitter:description"]') ||
    firstMetaContent($, 'meta[property="twitter:description"]');
  const twitterImageRaw =
    firstMetaContent($, 'meta[name="twitter:image"]') ||
    firstMetaContent($, 'meta[property="twitter:image"]') ||
    firstMetaContent($, 'meta[name="twitter:image:src"]');

  const docTitle = trimMeta($("title").first().text());
  const metaDesc = firstMetaContent($, 'meta[name="description"]');

  const title = ogTitleRaw || twitterTitleRaw || docTitle;
  const description = ogDescRaw || twitterDescRaw || metaDesc;

  const imageCandidate =
    ogImageRaw ||
    twitterImageRaw;
  const imageUrl = imageCandidate
    ? resolveAbsoluteImage(imageCandidate, finalUrl)
    : null;

  const ogSiteName = firstMetaContent($, 'meta[property="og:site_name"]');

  let hostname = "";
  try {
    hostname = new URL(finalUrl).hostname;
  } catch {
    hostname = "";
  }

  const siteName = ogSiteName || hostname;

  const ogUrlRaw = firstMetaContent($, 'meta[property="og:url"]');
  const canonicalRaw = $('link[rel="canonical"]').first().attr("href");
  const canonicalTrimmed = trimMeta(canonicalRaw);

  let displayUrl = finalUrl;
  const fromOg = ogUrlRaw ? normalizeUrl(ogUrlRaw, finalUrl) : null;
  const fromCanonical = canonicalTrimmed
    ? normalizeUrl(canonicalTrimmed, finalUrl)
    : null;
  if (fromOg) displayUrl = fromOg;
  else if (fromCanonical) displayUrl = fromCanonical;

  const twitterCard =
    trimMeta(
      $('meta[name="twitter:card"]').first().attr("content") ??
        $('meta[property="twitter:card"]').first().attr("content"),
    ) || null;

  const ogCoreComplete = Boolean(ogTitleRaw && ogDescRaw && ogImageRaw);

  const chips: SocialPreviewChips = {
    titleFound: title.length > 0,
    descriptionFound: description.length > 0,
    imageFound: imageUrl !== null,
    ogCoreComplete,
  };

  return {
    title,
    description,
    imageUrl,
    siteName,
    displayUrl,
    twitterCard,
    chips,
  };
}
