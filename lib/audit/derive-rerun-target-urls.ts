import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_CRAWL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  isAssetUrl,
  normalizeUrl,
  sameAuditSiteOrigin,
} from "@/lib/crawler/normalize";
import { fetchUrlsFromShards } from "@/lib/crawler/sitemap";

const LEGACY_MAX_PAGES = 10;
const HARD_PAGE_CEILING = 1000;
const MAX_SHARD_URLS = 50;

/** Match runner `clampPageCap` semantics. */
function clampAuditMaxPages(raw: number | null): number {
  if (raw === null || !Number.isFinite(raw)) return LEGACY_MAX_PAGES;
  if (raw < 1) return 1;
  if (raw > HARD_PAGE_CEILING) return HARD_PAGE_CEILING;
  return Math.floor(raw);
}

function normalizeUrlAllowlist(
  websiteUrl: string,
  candidates: string[],
  maxPages: number,
): string[] | { error: string } {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return {
        error:
          "A saved scan URL is invalid — start a new scan from the URL picker.",
      };
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return { error: "Saved scan URLs must use http(s)." };
    }
    if (!sameAuditSiteOrigin(websiteUrl, trimmed)) {
      return {
        error:
          "This scan’s URLs no longer match the community’s domain — start a new scan.",
      };
    }
    const normalized = normalizeUrl(trimmed);
    if (!normalized) continue;
    if (isAssetUrl(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= maxPages) break;
  }
  return out;
}

function sanitizeShardUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_SHARD_URLS) break;
  }
  return out;
}

export type PriorAuditRow = {
  id: string;
  community_id: string;
  target_urls: unknown;
  shard_urls: unknown;
  max_pages: number | null;
};

/**
 * Rebuild the URL list for a rerun: persisted target_urls, else shard fetch,
 * else URLs from scored audit_pages rows (legacy / partial runs).
 */
export async function deriveRerunTargetUrls(
  supabase: SupabaseClient,
  websiteUrl: string,
  prior: PriorAuditRow,
): Promise<
  | { ok: true; urls: string[]; shardUrlsMeta: string[] | null }
  | { ok: false; error: string }
> {
  const cap = clampAuditMaxPages(prior.max_pages);
  const shardMeta = sanitizeShardUrls(prior.shard_urls);
  const shardMetaOrNull = shardMeta.length > 0 ? shardMeta : null;

  const rawTargets = Array.isArray(prior.target_urls)
    ? prior.target_urls.filter((u): u is string => typeof u === "string")
    : [];

  if (rawTargets.length > 0) {
    const normalized = normalizeUrlAllowlist(websiteUrl, rawTargets, cap);
    if ("error" in normalized) return { ok: false, error: normalized.error };
    if (normalized.length === 0) {
      return {
        ok: false,
        error:
          "Could not rerun — every saved URL was filtered out for this community.",
      };
    }
    return { ok: true, urls: normalized, shardUrlsMeta: shardMetaOrNull };
  }

  if (shardMetaOrNull && shardMetaOrNull.length > 0) {
    const base = normalizeUrl(websiteUrl);
    if (!base) {
      return { ok: false, error: "Community website URL is invalid." };
    }
    const fromShards = await fetchUrlsFromShards(shardMetaOrNull, base, {
      maxPages: cap,
      timeoutMs: DEFAULT_CRAWL_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
    });
    if (fromShards.length === 0) {
      return {
        ok: false,
        error:
          "Could not rerun — sitemap categories returned no URLs (the site may have changed). Start a new scan.",
      };
    }
    return {
      ok: true,
      urls: fromShards.slice(0, cap),
      shardUrlsMeta: shardMetaOrNull,
    };
  }

  const { data: pageRows, error: pErr } = await supabase
    .from("audit_pages")
    .select("url")
    .eq("audit_id", prior.id)
    .order("created_at", { ascending: true });

  if (pErr) {
    return { ok: false, error: "Could not load pages from the prior scan." };
  }

  const rawPageUrls = (pageRows ?? [])
    .map((r) => (r as { url?: unknown }).url)
    .filter((u): u is string => typeof u === "string");

  const normalized = normalizeUrlAllowlist(websiteUrl, rawPageUrls, cap);
  if ("error" in normalized) return { ok: false, error: normalized.error };
  if (normalized.length === 0) {
    return {
      ok: false,
      error:
        "Could not rerun — this scan has no saved URL list or scored pages. Start a new scan.",
    };
  }

  return { ok: true, urls: normalized, shardUrlsMeta: null };
}
