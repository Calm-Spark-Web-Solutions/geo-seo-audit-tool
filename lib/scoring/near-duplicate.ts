import type { AuditCheck, AuditCheckEvidenceItem } from "@/types";

import { scoreFromResult } from "./deterministic";

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function extractMetaDesc(html: string): string {
  const nameFirst =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html);
  if (nameFirst) return nameFirst[1].replace(/\s+/g, " ").trim();
  const contentFirst =
    /<meta[^>]+content=["']([^"']*)[^>]+name=["']description["']/i.exec(html);
  return contentFirst ? contentFirst[1].replace(/\s+/g, " ").trim() : "";
}

function snippetForUi(s: string, max = 120): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Cross-page duplicate title and meta description detection.
 * Runs once per audit after all HTML is fetched. Returns two AuditCheck rows
 * stored on the audit row under `near_duplicate_checks`.
 */
export function buildNearDuplicateChecks(
  pages: { url: string; html: string }[],
): AuditCheck[] {
  const byTitle = new Map<string, string[]>();
  const byDesc = new Map<string, string[]>();

  for (const { url, html } of pages) {
    const title = extractTitle(html).toLowerCase();
    if (title.length >= 5) {
      const bucket = byTitle.get(title) ?? [];
      bucket.push(url);
      byTitle.set(title, bucket);
    }

    const desc = extractMetaDesc(html).toLowerCase();
    if (desc.length >= 20) {
      const bucket = byDesc.get(desc) ?? [];
      bucket.push(url);
      byDesc.set(desc, bucket);
    }
  }

  const dupTitleGroups = [...byTitle.entries()].filter(([, urls]) => urls.length >= 2);
  const dupDescGroups = [...byDesc.entries()].filter(([, urls]) => urls.length >= 2);

  const checks: AuditCheck[] = [];

  // ---------- duplicate titles ----------

  const titleDupPageCount = dupTitleGroups.reduce((n, [, urls]) => n + urls.length, 0);
  const titleResult = dupTitleGroups.length === 0 ? "pass" : "fail" as const;
  const titleEvidence: AuditCheckEvidenceItem[] = dupTitleGroups.slice(0, 25).flatMap(
    ([title, urls]) =>
      urls.slice(0, 5).map((url): AuditCheckEvidenceItem => ({
        type: "kv",
        label: snippetForUi(title, 80),
        value: url,
      })),
  );

  checks.push({
    key: "near_dup_titles",
    label: "Duplicate title tags",
    result: titleResult,
    score: scoreFromResult(titleResult),
    explanation:
      titleResult === "pass"
        ? `All ${pages.length} audited page title(s) are unique.`
        : `${dupTitleGroups.length} duplicate title group(s) found across ${titleDupPageCount} pages — duplicate titles dilute keyword targeting and confuse crawlers.`,
    category: "Near-duplicate content",
    pillar: "SEO",
    ...(titleEvidence.length > 0
      ? { evidence: { totalCount: titleDupPageCount, items: titleEvidence } }
      : {}),
  });

  // ---------- duplicate meta descriptions ----------

  const descDupPageCount = dupDescGroups.reduce((n, [, urls]) => n + urls.length, 0);
  const descResult = dupDescGroups.length === 0 ? "pass" : "warn" as const;
  const descEvidence: AuditCheckEvidenceItem[] = dupDescGroups.slice(0, 25).flatMap(
    ([desc, urls]) =>
      urls.slice(0, 5).map((url): AuditCheckEvidenceItem => ({
        type: "kv",
        label: snippetForUi(desc, 80),
        value: url,
      })),
  );

  checks.push({
    key: "near_dup_meta_desc",
    label: "Duplicate meta descriptions",
    result: descResult,
    score: scoreFromResult(descResult),
    explanation:
      descResult === "pass"
        ? `All ${pages.length} audited page meta description(s) are unique.`
        : `${dupDescGroups.length} duplicate meta description group(s) found across ${descDupPageCount} pages — unique descriptions improve click-through rates and SERP clarity.`,
    category: "Near-duplicate content",
    pillar: "SEO",
    ...(descEvidence.length > 0
      ? { evidence: { totalCount: descDupPageCount, items: descEvidence } }
      : {}),
  });

  return checks;
}
