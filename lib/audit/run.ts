import type { SupabaseClient } from "@supabase/supabase-js";

import { generatePageAiComment } from "@/lib/anthropic/page-comment";
import { crawlSite } from "@/lib/crawler/crawl";
import { fetchPageHtml } from "@/lib/crawler/fetch";
import {
  DEFAULT_USER_AGENT,
  normalizeUrl,
} from "@/lib/crawler/normalize";
import { fetchSitemap } from "@/lib/crawler/sitemap";
import { scorePage } from "@/lib/scoring/stub";
import type { AuditCheck, FixItem } from "@/types";

const AUDIT_MAX_PAGES = 10;
const FETCH_TIMEOUT_MS = 8000;
const BATCH_SIZE = 5;
const AI_COMMENT_CONCURRENCY = 2;

type ScoredRow = {
  id: string;
  url: string;
  html: string;
  score: number;
  seoScore: number;
  geoScore: number;
  seo_results: AuditCheck[];
  geo_results: AuditCheck[];
  fixes: FixItem[];
};

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const batch = await Promise.all(slice.map((item) => fn(item)));
    results.push(...batch);
  }
  return results;
}

/**
 * Crawl up to AUDIT_MAX_PAGES URLs, score each page, persist audit_pages,
 * and update the parent audits row. Streams progress: progress_total set
 * after URL discovery, pages_crawled increments per insert, ai_comment
 * fills in afterward. Uses RLS-scoped Supabase client.
 */
export async function runAudit({
  supabase,
  auditId,
  websiteUrl,
}: {
  supabase: SupabaseClient;
  auditId: string;
  websiteUrl: string;
}): Promise<void> {
  const base = normalizeUrl(websiteUrl);
  if (!base) {
    await supabase
      .from("audits")
      .update({
        status: "failed",
        pages_crawled: 0,
        progress_total: 0,
        score: null,
        seo_score: null,
        geo_score: null,
      })
      .eq("id", auditId);
    throw new Error("Invalid website URL");
  }

  await supabase
    .from("audits")
    .update({ status: "running" })
    .eq("id", auditId);

  let urls = await fetchSitemap(base, {
    maxPages: AUDIT_MAX_PAGES,
    timeoutMs: FETCH_TIMEOUT_MS,
    userAgent: DEFAULT_USER_AGENT,
  });
  if (urls.length === 0) {
    urls = await crawlSite(base, {
      maxPages: AUDIT_MAX_PAGES,
      timeoutMs: FETCH_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
    });
  }

  await supabase
    .from("audits")
    .update({ progress_total: urls.length })
    .eq("id", auditId);

  if (urls.length === 0) {
    await supabase
      .from("audits")
      .update({
        status: "complete",
        pages_crawled: 0,
        progress_total: 0,
        score: null,
        seo_score: null,
        geo_score: null,
      })
      .eq("id", auditId);
    return;
  }

  const htmlResults = await mapInBatches(urls, BATCH_SIZE, async (url) => {
    const html = await fetchPageHtml(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      userAgent: DEFAULT_USER_AGENT,
    });
    return { url, html };
  });

  const scored: ScoredRow[] = [];
  let pagesCrawled = 0;

  for (const { url, html } of htmlResults) {
    if (!html) continue;
    const s = scorePage(html, url);
    const insertOne = await supabase
      .from("audit_pages")
      .insert({
        audit_id: auditId,
        url,
        score: s.score,
        seo_results: s.seoChecks,
        geo_results: s.geoChecks,
        fixes: s.fixes,
      })
      .select("id")
      .single();
    if (insertOne.error || !insertOne.data) {
      throw new Error(insertOne.error?.message ?? "Failed to insert audit page");
    }
    pagesCrawled += 1;
    await supabase
      .from("audits")
      .update({ pages_crawled: pagesCrawled })
      .eq("id", auditId);
    scored.push({
      id: insertOne.data.id,
      url,
      html,
      score: s.score,
      seoScore: s.seoScore,
      geoScore: s.geoScore,
      seo_results: s.seoChecks,
      geo_results: s.geoChecks,
      fixes: s.fixes,
    });
  }

  for (let i = 0; i < scored.length; i += AI_COMMENT_CONCURRENCY) {
    const slice = scored.slice(i, i + AI_COMMENT_CONCURRENCY);
    const comments = await Promise.all(
      slice.map((row) =>
        generatePageAiComment({
          url: row.url,
          html: row.html,
          seoChecks: row.seo_results,
          geoChecks: row.geo_results,
          fixes: row.fixes,
        }),
      ),
    );
    await Promise.all(
      slice.map((row, j) =>
        comments[j]
          ? supabase
              .from("audit_pages")
              .update({ ai_comment: comments[j] })
              .eq("id", row.id)
          : Promise.resolve(),
      ),
    );
  }

  let seoAvg: number | null = null;
  let geoAvg: number | null = null;
  let totalAvg: number | null = null;
  if (scored.length > 0) {
    const seoSum = scored.reduce((a, r) => a + r.seoScore, 0);
    const geoSum = scored.reduce((a, r) => a + r.geoScore, 0);
    const totalSum = scored.reduce((a, r) => a + r.score, 0);
    seoAvg = Math.round(seoSum / scored.length);
    geoAvg = Math.round(geoSum / scored.length);
    totalAvg = Math.round(totalSum / scored.length);
  }

  await supabase
    .from("audits")
    .update({
      status: "complete",
      pages_crawled: scored.length,
      score: totalAvg,
      seo_score: seoAvg,
      geo_score: geoAvg,
    })
    .eq("id", auditId);
}

export async function markAuditFailed(
  supabase: SupabaseClient,
  auditId: string,
): Promise<void> {
  await supabase
    .from("audits")
    .update({ status: "failed" })
    .eq("id", auditId);
}
