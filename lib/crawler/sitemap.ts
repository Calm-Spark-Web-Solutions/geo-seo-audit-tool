import axios from "axios";
import { XMLParser } from "fast-xml-parser";

import { assertSafeUrl } from "@/lib/security/ssrf";

import {
  DEFAULT_CRAWL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  MAX_PAGES,
  alignShardUrlToBaseOrigin,
  dedupeSitemapShardUrls,
  isAssetUrl,
  normalizeUrl,
  originOf,
  sameAuditSiteOrigin,
} from "./normalize";
import { mapWithConcurrency } from "./concurrency";
import { describeShard } from "./shard-labels";

const COMMON_SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap1.xml",
];

/**
 * Cap on parallel HTTP fetches against a single origin during sitemap
 * discovery. 5 is enough to flatten the longest "common case" (10–20 leaf
 * shards) into ~3 round-trips while staying polite — sitemaps live behind
 * the same CDN as the rest of the site, so hammering them at higher
 * concurrency would hurt user-facing pages on shared infrastructure.
 */
const SITEMAP_CONCURRENCY = 5;

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

interface FetchSettings {
  timeout: number;
  userAgent: string;
}

export interface SitemapShard {
  /** Stable id — the shard sitemap URL itself. */
  url: string;
  /** Human label (e.g. "Pages", "Posts"). */
  label: string;
  /** Total URL count discovered in this shard. */
  urlCount: number;
  /** Collected, normalized, same-origin, non-asset URLs. */
  urls: string[];
  /** Sort priority (smaller = surfaced first in the picker). */
  priority: number;
  /** Whether the picker should pre-check this shard by default. */
  defaultChecked: boolean;
}

/**
 * Discover sitemap shards for a base URL and return them grouped. Sites
 * that expose a `sitemapindex` get one shard per child; sites with only a
 * flat `urlset` collapse to a single "All pages" shard. Sites without any
 * sitemap return an empty array — callers should fall back to a crawl.
 */
export async function fetchSitemapShards(
  baseUrl: string,
  options: FetchOptions = {},
): Promise<SitemapShard[]> {
  const origin = originOf(baseUrl);
  if (!origin) return [];

  const settings: FetchSettings = {
    timeout: options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  };

  const seedUrls = await discoverSitemaps(origin, settings);
  if (seedUrls.length === 0) return [];

  // Resolve seed sitemaps to leaf shard URLs (urlset files). Walk the tree
  // breadth-first, fetching each level in parallel under
  // SITEMAP_CONCURRENCY — the previous sequential `for...await` chained
  // round-trips and made the new-audit picker take 5–15 s on sites with
  // 10+ leaf sitemaps.
  const leafShards = new Set<string>();
  const visited = new Set<string>();
  let frontier = [...seedUrls];

  while (frontier.length > 0) {
    const level = frontier.filter((u) => !visited.has(u));
    for (const u of level) visited.add(u);

    const xmls = await mapWithConcurrency(level, SITEMAP_CONCURRENCY, (u) =>
      safeFetch(u, settings),
    );

    const nextFrontier: string[] = [];
    for (let i = 0; i < level.length; i += 1) {
      const xml = xmls[i];
      if (!xml) continue;
      const parsed = safeParse(xml);
      if (!parsed) continue;

      if (parsed.sitemapindex?.sitemap) {
        for (const entry of parsed.sitemapindex.sitemap) {
          const loc = normalizeUrl(extractLoc(entry) ?? "", level[i]);
          if (loc && sameAuditSiteOrigin(origin, loc)) nextFrontier.push(loc);
        }
        continue;
      }

      if (parsed.urlset?.url) {
        leafShards.add(level[i]);
      }
    }

    frontier = nextFrontier;
  }

  if (leafShards.size === 0) return [];

  const canonicalBase = normalizeUrl(baseUrl) ?? baseUrl;
  const leafUrls = dedupeSitemapShardUrls(Array.from(leafShards)).map((url) =>
    alignShardUrlToBaseOrigin(url, canonicalBase),
  );
  const leafXmls = await mapWithConcurrency(leafUrls, SITEMAP_CONCURRENCY, (u) =>
    safeFetch(u, settings),
  );

  const shards: SitemapShard[] = [];
  for (let i = 0; i < leafUrls.length; i += 1) {
    const shardUrl = leafUrls[i];
    const xml = leafXmls[i];
    if (!xml) continue;
    const parsed = safeParse(xml);
    if (!parsed?.urlset?.url) continue;

    const urls: string[] = [];
    const seen = new Set<string>();
    for (const entry of parsed.urlset.url) {
      const loc = normalizeUrl(extractLoc(entry) ?? "", shardUrl);
      if (!loc) continue;
      if (!sameAuditSiteOrigin(origin, loc)) continue;
      if (isAssetUrl(loc)) continue;
      if (seen.has(loc)) continue;
      seen.add(loc);
      urls.push(loc);
    }
    if (urls.length === 0) continue;

    const descriptor = describeShard(shardUrl);
    shards.push({
      url: shardUrl,
      label: descriptor.label,
      urlCount: urls.length,
      urls,
      priority: descriptor.priority,
      defaultChecked: descriptor.defaultChecked,
    });
  }

  // If a single shard came back from a flat sitemap, relabel it as
  // "All pages" so the UI is honest about the lack of categorization.
  if (shards.length === 1) {
    shards[0] = { ...shards[0], label: "All pages", priority: 0 };
  }

  shards.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.label.localeCompare(b.label) ||
      a.url.localeCompare(b.url),
  );

  return shards;
}

/**
 * Fetch URLs from a specific set of shard sitemaps and return a deduped,
 * capped, same-origin list. Used by the runner once a user has confirmed
 * their selection on the new-audit form.
 */
export async function fetchUrlsFromShards(
  shardUrls: string[],
  baseUrl: string,
  options: FetchOptions = {},
): Promise<string[]> {
  const origin = originOf(baseUrl);
  if (!origin) return [];

  const max = options.maxPages ?? MAX_PAGES;
  const settings: FetchSettings = {
    timeout: options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  };

  const collected: string[] = [];
  const seen = new Set<string>();

  // Chunked parallel fetch so we still honor the per-page cap (early-out
  // when `collected.length >= max`) while flattening latency across the
  // selected shards.
  for (let i = 0; i < shardUrls.length; i += SITEMAP_CONCURRENCY) {
    if (collected.length >= max) break;
    const chunk = shardUrls.slice(i, i + SITEMAP_CONCURRENCY);

    const xmls = await mapWithConcurrency(chunk, SITEMAP_CONCURRENCY, async (u) =>
      sameAuditSiteOrigin(origin, u) ? safeFetch(u, settings) : null,
    );

    for (let j = 0; j < chunk.length; j += 1) {
      if (collected.length >= max) break;
      const shardUrl = chunk[j];
      const xml = xmls[j];
      if (!xml) continue;
      const parsed = safeParse(xml);
      if (!parsed?.urlset?.url) continue;

      for (const entry of parsed.urlset.url) {
        if (collected.length >= max) break;
        const loc = normalizeUrl(extractLoc(entry) ?? "", shardUrl);
        if (!loc) continue;
        if (!sameAuditSiteOrigin(origin, loc)) continue;
        if (isAssetUrl(loc)) continue;
        if (seen.has(loc)) continue;
        seen.add(loc);
        collected.push(loc);
      }
    }
  }

  return collected;
}

function allNeededUrlsClassified(
  neededUrls: ReadonlySet<string>,
  map: Map<string, string>,
): boolean {
  for (const u of neededUrls) {
    if (!map.has(u)) return false;
  }
  return true;
}

/**
 * Normalized URL → sitemap category label for each URL appearing in the given
 * shard sitemaps. Same traversal order and dedupe rules as {@link fetchUrlsFromShards}
 * (first shard wins).
 *
 * When `neededUrls` is omitted, every URL in each shard is recorded (legacy behavior).
 * When `neededUrls` is provided, only those URLs are stored and iteration stops early
 * once all needed URLs are classified — skipping irrelevant XML rows and often avoiding
 * extra shard fetches (large performance win vs scanning entire sitemaps).
 */
export async function buildUrlToSitemapCategoryLabelMap(
  shardUrls: string[],
  baseUrl: string,
  options: FetchOptions = {},
  neededUrls?: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const origin = originOf(baseUrl);
  const out = new Map<string, string>();
  if (!origin || shardUrls.length === 0) return out;

  if (neededUrls !== undefined && neededUrls.size === 0) return out;

  const settings: FetchSettings = {
    timeout: options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  };

  for (let i = 0; i < shardUrls.length; i += SITEMAP_CONCURRENCY) {
    const chunk = shardUrls.slice(i, i + SITEMAP_CONCURRENCY);

    const xmls = await mapWithConcurrency(chunk, SITEMAP_CONCURRENCY, async (u) =>
      sameAuditSiteOrigin(origin, u) ? safeFetch(u, settings) : null,
    );

    for (let j = 0; j < chunk.length; j += 1) {
      const shardUrl = chunk[j];
      const xml = xmls[j];
      if (!xml) continue;
      const parsed = safeParse(xml);
      if (!parsed?.urlset?.url) continue;

      const label = describeShard(shardUrl).label;

      for (const entry of parsed.urlset.url) {
        const loc = normalizeUrl(extractLoc(entry) ?? "", shardUrl);
        if (!loc) continue;
        if (!sameAuditSiteOrigin(origin, loc)) continue;
        if (isAssetUrl(loc)) continue;
        if (neededUrls !== undefined && !neededUrls.has(loc)) continue;
        if (out.has(loc)) continue;
        out.set(loc, label);
        if (
          neededUrls !== undefined &&
          allNeededUrlsClassified(neededUrls, out)
        ) {
          return out;
        }
      }
    }
  }

  return out;
}

/**
 * Fetch and parse sitemap(s) for a base URL. Tries `robots.txt`, then common
 * sitemap paths, follows sitemap indexes, and returns a deduped, capped list
 * of HTML page URLs. Back-compat path used when the user has not picked
 * specific shards (legacy audits, no-sitemap fallback inside the runner).
 */
export async function fetchSitemap(
  baseUrl: string,
  options: FetchOptions = {},
): Promise<string[]> {
  const origin = originOf(baseUrl);
  if (!origin) return [];

  const max = options.maxPages ?? MAX_PAGES;
  const settings: FetchSettings = {
    timeout: options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  };

  const sitemapUrls = await discoverSitemaps(origin, settings);
  if (sitemapUrls.length === 0) return [];

  const collected = new Set<string>();
  const visited = new Set<string>();
  let frontier = [...sitemapUrls];

  // BFS in parallel-per-level so a sitemap-index whose children all live on
  // the same CDN doesn't pay N sequential round-trips. The per-level cap
  // (`SITEMAP_CONCURRENCY`) keeps us polite on shared infra.
  while (frontier.length > 0 && collected.size < max) {
    const level = frontier.filter((u) => !visited.has(u));
    for (const u of level) visited.add(u);

    const xmls = await mapWithConcurrency(level, SITEMAP_CONCURRENCY, (u) =>
      safeFetch(u, settings),
    );

    const nextFrontier: string[] = [];
    for (let i = 0; i < level.length && collected.size < max; i += 1) {
      const xml = xmls[i];
      if (!xml) continue;
      const parsed = safeParse(xml);
      if (!parsed) continue;

      if (parsed.sitemapindex?.sitemap) {
        for (const entry of parsed.sitemapindex.sitemap) {
          const loc = normalizeUrl(extractLoc(entry) ?? "", level[i]);
          // Same-origin guard: only follow nested sitemap shards on the
          // crawl base origin so we don't fan out to third-party hosts.
          if (loc && sameAuditSiteOrigin(origin, loc)) nextFrontier.push(loc);
        }
        continue;
      }

      if (parsed.urlset?.url) {
        for (const entry of parsed.urlset.url) {
          if (collected.size >= max) break;
          const loc = normalizeUrl(extractLoc(entry) ?? "", level[i]);
          if (loc && sameAuditSiteOrigin(origin, loc) && !isAssetUrl(loc)) {
            collected.add(loc);
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return Array.from(collected).slice(0, max);
}

async function discoverSitemaps(
  origin: string,
  settings: FetchSettings,
): Promise<string[]> {
  const found = new Set<string>();

  const robots = await safeFetch(`${origin}/robots.txt`, settings);
  if (robots) {
    const lines = robots.split(/\r?\n/);
    for (const line of lines) {
      const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
      if (match) {
        const url = normalizeUrl(match[1], origin);
        // Same-origin guard for robots-declared `Sitemap:` lines. Without
        // this, a hostile robots.txt could direct the crawler off-origin
        // and the SSRF guard would then have to catch it; rejecting
        // off-origin entries up-front is simpler and matches the
        // sitemap-index follow rules elsewhere in this file.
        if (url && sameAuditSiteOrigin(origin, url)) found.add(url);
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
  { timeout, userAgent }: FetchSettings,
): Promise<string | null> {
  try {
    // SSRF preflight — same null-on-failure semantics as a network error
    // so a hostile sitemap entry can't poison the rest of the crawl.
    await assertSafeUrl(url);
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
