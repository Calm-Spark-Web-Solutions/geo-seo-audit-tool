import { textExcerptFromHtml } from "@/lib/anthropic/excerpt";
import type { AuditCheck, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

const DEFAULT_MAX_PAGES = 48;
const DEFAULT_HAMMING_MAX = 11;
/** Cap pairwise comparisons before sampling. */
const DEFAULT_MAX_PAIRS = 400;

function envInt(key: string, fallback: number): number {
  const v = Number.parseInt(process.env[key]?.trim() ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function envHamming(): number {
  const v = Number.parseInt(process.env.AUDIT_NEAR_DUP_HAMMING_MAX?.trim() ?? "", 10);
  return Number.isFinite(v) && v >= 0 && v <= 64 ? v : DEFAULT_HAMMING_MAX;
}

function tokenize(normalizedText: string): string[] {
  return normalizedText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 5000);
}

const FNV_OFFSET = BigInt("14695981039346656037");
const FNV_PRIME = BigInt("1099511628211");
const BIT64_MASK = (BigInt(1) << BigInt(64)) - BigInt(1);
const B0 = BigInt(0);
const B1 = BigInt(1);

function fnv64Token(token: string): bigint {
  let h = FNV_OFFSET;
  for (let i = 0; i < token.length; i++) {
    h ^= BigInt(token.charCodeAt(i));
    h = (h * FNV_PRIME) & BIT64_MASK;
  }
  return h;
}

function computeSimhash(tokens: string[]): bigint {
  if (tokens.length === 0) return B0;
  const dims = new Array<number>(64).fill(0);
  for (const tok of tokens) {
    const hv = fnv64Token(tok);
    for (let b = 0; b < 64; b++) {
      const bit = BigInt(b);
      dims[b] += ((hv >> bit) & B1) === B1 ? 1 : -1;
    }
  }
  let out = B0;
  for (let b = 0; b < 64; b++) {
    const bit = BigInt(b);
    if (dims[b] >= 1) out |= B1 << bit;
  }
  return out & BIT64_MASK;
}

function hamming64(a: bigint, b: bigint): number {
  let x = (a ^ b) & BIT64_MASK;
  let c = 0;
  while (x !== B0) {
    c += 1;
    x &= x - B1;
  }
  return c;
}

function pathOrShortUrl(u: string, maxLen = 56): string {
  try {
    const parsed = new URL(u);
    const pathPart = `${parsed.pathname}${parsed.search}` || "/";
    return pathPart.length <= maxLen
      ? pathPart
      : `${pathPart.slice(0, maxLen - 1)}…`;
  } catch {
    return u.length <= maxLen ? u : `${u.slice(0, maxLen - 1)}…`;
  }
}

function checkRow(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    category: "Similar pages",
    pillar: "GEO",
  };
}

/**
 * Within-batch near-duplicate detection using SimHash + Hamming distance.
 * Off by default when AUDIT_NEAR_DUP_MAX_PAGES=0; otherwise caps via env.
 */
export function computeNearDuplicateChecksForBatch(
  pages: { url: string; html: string }[],
): AuditCheck[] {
  if (process.env.AUDIT_NEAR_DUP_MAX_PAGES?.trim() === "0") return [];
  if ((pages.length ?? 0) < 2) return [];

  const maxPages = envInt(
    "AUDIT_NEAR_DUP_MAX_PAGES",
    DEFAULT_MAX_PAGES,
  );
  const maxPairs = envInt("AUDIT_NEAR_DUP_MAX_PAIRS", DEFAULT_MAX_PAIRS);
  const hamThr = envHamming();

  if (maxPages <= 1) return [];

  const slice = pages.slice(0, Math.min(maxPages, pages.length));

  type Row = { url: string; hash: bigint };
  const rows: Row[] = [];
  for (const { url, html } of slice) {
    const excerpt = textExcerptFromHtml(html, 12_000);
    const tokens = tokenize(excerpt);
    rows.push({ url, hash: computeSimhash(tokens) });
  }

  const dupPairs: { a: string; b: string; dist: number }[] = [];

  outer: for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const dist = hamming64(rows[i]!.hash, rows[j]!.hash);
      if (dist <= hamThr) {
        dupPairs.push({ a: rows[i]!.url, b: rows[j]!.url, dist });
        if (dupPairs.length >= maxPairs) break outer;
      }
    }
  }

  if (dupPairs.length === 0) {
    const passExplanation =
      `We compared readable text from up to ${rows.length} page${rows.length === 1 ? "" : "s"} included in this audit run only — not your whole domain.\n\n` +
      `No pair looked similar enough to flag (shared templates or thin repeats).\n\n` +
      `Technical: each page gets a text fingerprint; we flag pairs when fingerprints differ by at most ${hamThr} bits (smaller gap = more alike). None crossed that bar.`;
    return [
      checkRow(
        "near_duplicate_batch",
        "Similar pages in this audit (text overlap)",
        "pass",
        passExplanation,
      ),
    ];
  }

  const intro =
    `We compared readable text from pages that were fetched in this audit only to spot overlapping copy or shared templates (thin or duplicate-ish pages).`;

  const samples = dupPairs.slice(0, 4).map(({ a, b, dist }) => {
    const pa = pathOrShortUrl(a);
    const pb = pathOrShortUrl(b);
    return `${pa} ↔ ${pb} (distance ${dist} — lower means more alike)`;
  });
  const more =
    dupPairs.length > samples.length ? ` (${dupPairs.length} pairs total; showing ${samples.length}.)` : "";
  const technical = `Technical: fingerprints differ by ≤${hamThr} bits → marked similar — lower distance number means closer match.`;
  const bulletSamples = samples.map((s) => `• ${s}`).join("\n");
  const warnExplanation =
    `${intro} ${dupPairs.length} similar pair${dupPairs.length === 1 ? "" : "s"} showed up.${more}\n\nExamples:\n${bulletSamples}\n\n${technical}`;
  return [
    checkRow(
      "near_duplicate_batch",
      "Similar pages in this audit (text overlap)",
      "warn",
      warnExplanation.trim(),
    ),
  ];
}
