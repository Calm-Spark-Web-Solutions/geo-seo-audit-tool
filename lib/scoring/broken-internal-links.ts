import * as cheerio from "cheerio";

import { assertSafeUrl } from "@/lib/security/ssrf";
import { boundedText } from "@/lib/security/bounded-fetch";
import { normalizeUrl, sameOrigin } from "@/lib/crawler/normalize";
import type { AuditCheck, AuditCheckEvidenceItem, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

const DEFAULT_MAX_PROBES = 18;
const PROBE_TIMEOUT_MS = 5000;
const PROBE_MAX_BYTES = 64 * 1024;

function isSkippableHref(href: string): boolean {
  const h = href.trim().toLowerCase();
  return (
    h.startsWith("#") ||
    h.startsWith("javascript:") ||
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.startsWith("data:")
  );
}

/**
 * HEAD/GET a small set of same-origin targets discovered in HTML; flags
 * 4xx/5xx and hard errors. Bounded for cost and SSRF-safe.
 */
export async function probeBrokenInternalLinks(
  html: string,
  pageUrl: string,
  maxProbes: number = DEFAULT_MAX_PROBES,
): Promise<AuditCheck> {
  const $ = cheerio.load(html);
  const targets: string[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    if (targets.length >= maxProbes) return false;
    const href = $(el).attr("href");
    if (!href || isSkippableHref(href)) return;
    const abs = normalizeUrl(href, pageUrl);
    if (!abs || !sameOrigin(pageUrl, abs)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    targets.push(abs);
    return undefined;
  });

  if (targets.length === 0) {
    return {
      key: "internal_link_health",
      label: "Internal link reachability (sampled)",
      result: "warn",
      explanation:
        "No same-origin links found in HTML to probe; add internal navigation or expand the audited template.",
      score: scoreFromResult("warn"),
      category: "Crawlability",
      pillar: "SEO",
    };
  }

  const broken: { url: string; status: number; note?: string }[] = [];
  const errors: { url: string; note: string }[] = [];

  for (const target of targets) {
    try {
      await assertSafeUrl(target);
    } catch {
      errors.push({ url: target, note: "blocked (safety check)" });
      continue;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    let status = 0;
    try {
      let res = await fetch(target, {
        method: "HEAD",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Accept: "text/html,*/*" },
      });
      status = res.status;
      if (status === 405 || status === 501) {
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        res = await fetch(target, {
          method: "GET",
          redirect: "follow",
          signal: ctrl.signal,
          headers: { Accept: "text/html,*/*" },
        });
        status = res.status;
        await boundedText(res, PROBE_MAX_BYTES);
      } else if (status >= 200 && status < 400) {
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      errors.push({
        url: target,
        note: e instanceof Error ? e.message : "request failed",
      });
    } finally {
      clearTimeout(timer);
    }

    if (status >= 400) {
      broken.push({ url: target, status });
    }
  }

  const failN = broken.length + errors.length;
  let result: CheckResult = "pass";
  if (failN === 0) result = "pass";
  else if (failN === 1) result = "warn";
  else result = "fail";

  const lines: string[] = [
    `Sampled ${targets.length} unique same-origin URL(s) from this page’s links.`,
  ];
  if (broken.length > 0) {
    lines.push(
      `${broken.length} returned HTTP error (${broken
        .slice(0, 3)
        .map((b) => `${b.status} ${b.url}`)
        .join("; ")}${broken.length > 3 ? "…" : ""}).`,
    );
  }
  if (errors.length > 0) {
    lines.push(
      `${errors.length} could not be checked (${errors
        .slice(0, 2)
        .map((x) => x.url)
        .join(", ")}${errors.length > 2 ? "…" : ""}).`,
    );
  }
  if (failN === 0) {
    lines.push("No obvious 4xx/5xx responses in this sample.");
  }

  const items: AuditCheckEvidenceItem[] = [
    ...broken.slice(0, 10).map(
      (b): AuditCheckEvidenceItem => ({
        type: "kv",
        label: `HTTP ${b.status}`,
        value: b.url,
      }),
    ),
    ...errors.slice(0, 5).map(
      (b): AuditCheckEvidenceItem => ({
        type: "kv",
        label: "Error",
        value: `${b.url} — ${b.note}`,
      }),
    ),
  ];

  return {
    key: "internal_link_health",
    label: "Internal link reachability (sampled)",
    result,
    explanation: lines.join(" "),
    score: scoreFromResult(result),
    category: "Crawlability",
    pillar: "SEO",
    evidence: items.length > 0 ? { totalCount: failN, items } : undefined,
  };
}
