import * as cheerio from "cheerio";

import { fetchPageHtml } from "./fetch";
import {
  DEFAULT_CRAWL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  MAX_PAGES,
  isAssetUrl,
  normalizeUrl,
  sameOrigin,
} from "./normalize";

interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
}

/**
 * BFS crawl starting from `homepageUrl`, restricted to the same origin. Skips
 * known asset extensions and dedupes via normalized URLs. Returns at most
 * `maxPages` URLs.
 */
export async function crawlSite(
  homepageUrl: string,
  options: CrawlOptions = {},
): Promise<string[]> {
  const start = normalizeUrl(homepageUrl);
  if (!start) return [];

  const max = options.maxPages ?? MAX_PAGES;
  const timeout = options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  const collected: string[] = [];

  while (queue.length > 0 && collected.length < max) {
    const current = queue.shift()!;
    const html = await fetchPageHtml(current, { timeoutMs: timeout, userAgent });
    if (!html) continue;

    collected.push(current);
    if (collected.length >= max) break;

    const $ = cheerio.load(html);
    $("a[href]").each((_, el) => {
      if (collected.length + queue.length >= max * 2) return false;
      const href = $(el).attr("href");
      if (!href) return;
      const next = normalizeUrl(href, current);
      if (!next) return;
      if (!sameOrigin(start, next)) return;
      if (isAssetUrl(next)) return;
      if (seen.has(next)) return;
      seen.add(next);
      queue.push(next);
    });
  }

  return collected.slice(0, max);
}
