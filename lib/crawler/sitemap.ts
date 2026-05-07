import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import {
  DEFAULT_CRAWL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  MAX_PAGES,
  isAssetUrl,
  normalizeUrl,
  originOf,
} from "./normalize";

const COMMON_SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap1.xml",
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  isArray: (name) => name === "url" || name === "sitemap",
});

interface FetchOptions {
  maxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
}

/**
 * Fetch and parse sitemap(s) for a base URL. Tries `robots.txt`, then common
 * sitemap paths, follows sitemap indexes, and returns a deduped, capped list
 * of HTML page URLs.
 */
export async function fetchSitemap(
  baseUrl: string,
  options: FetchOptions = {},
): Promise<string[]> {
  const origin = originOf(baseUrl);
  if (!origin) return [];

  const max = options.maxPages ?? MAX_PAGES;
  const timeout = options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const sitemapUrls = await discoverSitemaps(origin, { timeout, userAgent });
  if (sitemapUrls.length === 0) return [];

  const collected = new Set<string>();
  const visited = new Set<string>();
  const queue = [...sitemapUrls];

  while (queue.length > 0 && collected.size < max) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);

    const xml = await safeFetch(next, { timeout, userAgent });
    if (!xml) continue;

    const parsed = safeParse(xml);
    if (!parsed) continue;

    if (parsed.sitemapindex?.sitemap) {
      for (const entry of parsed.sitemapindex.sitemap) {
        const loc = normalizeUrl(extractLoc(entry) ?? "", next);
        if (loc) queue.push(loc);
      }
      continue;
    }

    if (parsed.urlset?.url) {
      for (const entry of parsed.urlset.url) {
        if (collected.size >= max) break;
        const loc = normalizeUrl(extractLoc(entry) ?? "", next);
        if (loc && !isAssetUrl(loc)) collected.add(loc);
      }
    }
  }

  return Array.from(collected).slice(0, max);
}

async function discoverSitemaps(
  origin: string,
  { timeout, userAgent }: { timeout: number; userAgent: string },
): Promise<string[]> {
  const found = new Set<string>();

  const robots = await safeFetch(`${origin}/robots.txt`, { timeout, userAgent });
  if (robots) {
    const lines = robots.split(/\r?\n/);
    for (const line of lines) {
      const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
      if (match) {
        const url = normalizeUrl(match[1], origin);
        if (url) found.add(url);
      }
    }
  }

  for (const path of COMMON_SITEMAP_PATHS) {
    found.add(`${origin}${path}`);
  }

  return Array.from(found);
}

async function safeFetch(
  url: string,
  { timeout, userAgent }: { timeout: number; userAgent: string },
): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout,
      headers: { "User-Agent": userAgent, Accept: "*/*" },
      responseType: "text",
      validateStatus: (s) => s >= 200 && s < 300,
      maxContentLength: 5 * 1024 * 1024,
      transitional: { clarifyTimeoutError: true },
    });
    return typeof res.data === "string" ? res.data : String(res.data);
  } catch {
    return null;
  }
}

function safeParse(xml: string): SitemapXml | null {
  try {
    const out = parser.parse(xml) as SitemapXml;
    return out ?? null;
  } catch {
    return null;
  }
}

function extractLoc(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const loc = (entry as { loc?: unknown }).loc;
  if (typeof loc === "string") return loc.trim();
  if (loc && typeof loc === "object" && "#text" in loc) {
    const text = (loc as { "#text"?: unknown })["#text"];
    if (typeof text === "string") return text.trim();
  }
  return undefined;
}

interface SitemapEntry {
  loc?: string | { "#text"?: string };
}

interface SitemapXml {
  urlset?: { url?: SitemapEntry[] };
  sitemapindex?: { sitemap?: SitemapEntry[] };
}
