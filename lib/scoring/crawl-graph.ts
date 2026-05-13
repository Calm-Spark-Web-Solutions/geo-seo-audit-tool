import * as cheerio from "cheerio";

import { normalizeUrl, sameOrigin } from "@/lib/crawler/normalize";
import type { AuditCheck, AuditCheckEvidenceItem, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

export interface CrawlGraphPageInput {
  url: string;
  html: string;
}

function auditCheck(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
  evidence?: { items: AuditCheckEvidenceItem[]; totalCount?: number },
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    category: "Internal linking (crawl graph)",
    pillar: "SEO",
    ...(evidence && evidence.items.length > 0
      ? { evidence: { items: evidence.items, totalCount: evidence.totalCount } }
      : {}),
  };
}

/** Max orphan URLs stored as link evidence (bounded JSON size). */
const ORPHAN_URL_EVIDENCE_CAP = 100;

const GENERIC_ANCHOR = new Set([
  "",
  "read more",
  "learn more",
  "click here",
  "here",
  "more",
  "details",
  "›",
  "»",
  "…",
]);

function isGenericAnchor(raw: string): boolean {
  const t = raw.replace(/\s+/g, " ").trim().toLowerCase();
  if (GENERIC_ANCHOR.has(t)) return true;
  if (/^(more|read\s+more|learn\s+more)(\s*[.…]*)?$/i.test(t)) return true;
  return t.length <= 1;
}

/**
 * Site-wide checks from the directed link graph among audited URLs:
 * orphan in-links, crawl depth from the homepage (when in the set), and
 * generic internal anchor usage.
 */
export function buildCrawlGraphChecks(
  work: CrawlGraphPageInput[],
  baseOriginUrl: string,
): AuditCheck[] {
  if (work.length === 0) return [];

  const baseNorm = normalizeUrl(baseOriginUrl);
  const urlSet = new Set<string>();
  for (const p of work) {
    const u = normalizeUrl(p.url);
    if (u) urlSet.add(u);
  }

  const adj = new Map<string, Set<string>>();
  let internalLinkTotal = 0;
  let genericAnchors = 0;

  for (const u of urlSet) {
    adj.set(u, new Set());
  }

  for (const { url: pageUrl, html } of work) {
    const from = normalizeUrl(pageUrl);
    if (!from) continue;
    const $ = cheerio.load(html);
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const abs = normalizeUrl(href, pageUrl);
      if (!abs || !sameOrigin(pageUrl, abs)) return;
      if (!urlSet.has(abs)) return;
      if (abs === from) return;
      internalLinkTotal += 1;
      const anchor = $(el).text().replace(/\s+/g, " ").trim();
      if (isGenericAnchor(anchor)) genericAnchors += 1;
      adj.get(from)?.add(abs);
    });
  }

  const inDegree = new Map<string, number>();
  for (const u of urlSet) inDegree.set(u, 0);
  for (const [, tos] of adj) {
    for (const t of tos) {
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }

  const seed =
    baseNorm && urlSet.has(baseNorm)
      ? baseNorm
      : (normalizeUrl(work[0]!.url) ?? [...urlSet][0]!);

  const depth = new Map<string, number>();
  const queue: string[] = [];
  depth.set(seed, 0);
  queue.push(seed);
  while (queue.length > 0) {
    const u = queue.shift()!;
    const d = depth.get(u) ?? 0;
    for (const v of adj.get(u) ?? []) {
      if (depth.has(v)) continue;
      depth.set(v, d + 1);
      queue.push(v);
    }
  }

  const orphans: string[] = [];
  for (const u of urlSet) {
    if (u === seed) continue;
    if ((inDegree.get(u) ?? 0) === 0) orphans.push(u);
  }

  let maxDepth = 0;
  for (const [, d] of depth) {
    if (d > maxDepth) maxDepth = d;
  }

  const orphanShare = orphans.length / Math.max(1, urlSet.size);
  let orphanResult: CheckResult = "pass";
  if (orphans.length > 0) {
    orphanResult = orphanShare > 0.25 || orphans.length > 8 ? "fail" : "warn";
  }
  const orphanItems: AuditCheckEvidenceItem[] = orphans
    .slice(0, ORPHAN_URL_EVIDENCE_CAP)
    .map((u) => ({
    type: "link" as const,
    url: u,
  }));
  const orphanExplanation =
    orphans.length === 0
      ? `Every audited URL except the seed (${seed}) has at least one in-link from another audited page.`
      : `${orphans.length} audited URL(s) have no incoming internal link from other audited pages (excluding the seed). Orphans hurt discoverability and equity flow.`;

  let depthResult: CheckResult = "pass";
  if (maxDepth > 8) depthResult = "fail";
  else if (maxDepth > 5) depthResult = "warn";
  const depthExplanation = `Longest shortest-path depth from seed (${seed}) within this crawl is ${maxDepth}. Very deep trees can dilute crawl priority for money pages.`;

  const genRatio =
    internalLinkTotal > 0 ? genericAnchors / internalLinkTotal : 0;
  let genericResult: CheckResult = "pass";
  if (internalLinkTotal === 0) {
    genericResult = "warn";
  } else if (genRatio > 0.55) genericResult = "fail";
  else if (genRatio > 0.35) genericResult = "warn";
  const genericExplanation =
    internalLinkTotal === 0
      ? "No internal links between audited pages were found — expand the crawl or add cross-links."
      : `About ${Math.round(genRatio * 100)}% of internal links between audited pages use generic anchor text (e.g. “read more”, “here”). Descriptive anchors help topical authority.`;

  return [
    auditCheck(
      "crawl_graph_orphans",
      "Internal orphans (audited set)",
      orphanResult,
      orphanExplanation,
      orphanItems.length > 0
        ? { totalCount: orphans.length, items: orphanItems }
        : undefined,
    ),
    auditCheck(
      "crawl_graph_depth",
      "Internal crawl depth (from seed)",
      depthResult,
      depthExplanation,
      {
        items: [
          { type: "kv", label: "Seed URL", value: seed },
          { type: "kv", label: "Max depth", value: String(maxDepth) },
        ],
      },
    ),
    auditCheck(
      "crawl_graph_generic_anchors",
      "Internal anchor text quality (sampled graph)",
      genericResult,
      genericExplanation,
      internalLinkTotal > 0
        ? {
            items: [
              {
                type: "kv",
                label: "Internal links (within audit)",
                value: String(internalLinkTotal),
              },
              {
                type: "kv",
                label: "Generic anchors",
                value: String(genericAnchors),
              },
            ],
          }
        : undefined,
    ),
  ];
}
