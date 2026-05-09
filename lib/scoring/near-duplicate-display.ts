import type { AuditCheck } from "@/types";

/** Single batch row persisted on `audits.near_duplicate_checks`. */
export const NEAR_DUP_BATCH_KEY = "near_duplicate_batch";

const DISPLAY_LABEL =
  "Overlapping wording vs another page in this audit";

/**
 * Readable explanation for both legacy DB strings (Hamming/cohort jargon) and
 * current scorer copy. Prefer this at UI/PDF render time—not when persisting.
 */
export function humanizeNearDuplicateExplanation(raw: string): string {
  const t = raw.trim();
  if (!t) return t;

  if (/\bWe compared readable text\b/.test(t) || /\bfingerprints\b/.test(t)) {
    return softenCurrentScorerCopy(t);
  }

  const legacyPass = t.match(
    /^Compared up to (\d+) page(?: text)? fingerprints?;\s*no cohort pairs within Hamming distance (\d+)(?: \(simhash heuristic\))?\.?$/i,
  );
  if (legacyPass) {
    const [, n, ham] = legacyPass;
    return (
      `We compared readable text from up to ${n} page(s) audited in this run.\n\n` +
      `No two pages crossed our overlap cutoff (fingerprints farther apart than distance ${ham}), so none were flagged.\n\n` +
      `That does not promise every URL is editorially distinct; use this as automated triage only.`
    );
  }

  const legacy = t.match(
    /^Detected (\d+) cohort pairs? with similarity Hamming≤(\d+) \(possible thin\/duplicate editorial\)\.\s*([\s\S]*)$/i,
  );
  if (legacy) {
    const [, count, maxDist, tail] = legacy;
    let out =
      `We compared the visible words on each page that was audited (only those URLs—not your whole domain).\n\n` +
      `${count} pairs look very alike: overlapping body text or repeated template blocks (headers, footers, promos). ` +
      `Our check flags pairs when their “text fingerprints” are within ${maxDist} steps of each other (smaller = more similar).\n\n` +
      `That does not prove a Google duplicate-content penalty; use it as a short list of pages editors may want to differentiate.\n\n`;
    const examples = legacySamplesLines(tail);
    if (examples) out += `Examples:\n${examples}`;
    return out.trim();
  }

  return t
    .replace(/\bcohort pairs?\b/gi, "page pairs")
    .replace(/similarity Hamming≤(\d+)/gi, "overlap cutoff (difference limit $1)")
    .replace(/\bHamming\b/gi, "overlap distance")
    .replace(/\bthin\/duplicate editorial\b/gi, "thin or highly similar editorial")
    .replace(/(\d+)Δ:\s*/g, "Distance ~$1: ");
}

function softenCurrentScorerCopy(t: string): string {
  return t.replace(
    /Technical: fingerprints differ by ≤\d+ bits → marked similar — lower distance number means closer match\./,
    `Rule of thumb: the smaller each “distance” number, the more similar those two URLs looked.`,
  );
}

function legacySamplesLines(tail: string): string {
  const trimmed = tail.trim();
  const m = trimmed.match(/^Samples:\s*([\s\S]+)$/i);
  const body = (m?.[1] ?? trimmed).trim();
  if (!body) return "";

  const parts = body.split(/\s*;\s*/).filter(Boolean);
  const lines = parts.slice(0, 8).map((p) => {
    let s = p.replace(/^\d+Δ:\s*/, "").trim();
    s = s.replace(/\s*↔\s*/, "\n    vs ");
    return `• ${s}`;
  });

  let block = lines.join("\n");
  if (parts.length > 8) block += `\n• …`;
  return block;
}

export function withNearDuplicateDisplayCopy(check: AuditCheck): AuditCheck {
  if (check.key !== NEAR_DUP_BATCH_KEY) return check;
  return {
    ...check,
    label: DISPLAY_LABEL,
    category: "Similar pages",
    explanation: humanizeNearDuplicateExplanation(check.explanation),
  };
}

export function mapNearDuplicateChecksForDisplay(
  checks: AuditCheck[],
): AuditCheck[] {
  return checks.map(withNearDuplicateDisplayCopy);
}
