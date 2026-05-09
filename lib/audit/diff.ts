import type { AuditCheck, CheckResult } from "@/types";

export type CheckDelta =
  | {
      kind: "result_change";
      key: string;
      label: string;
      from: CheckResult;
      to: CheckResult;
      direction: "improved" | "regressed" | "lateral";
    }
  | { kind: "added"; key: string; label: string; result: CheckResult }
  | { kind: "removed"; key: string; label: string }
  | {
      kind: "score_change";
      key: string;
      label: string;
      from: number;
      to: number;
      delta: number;
    };

const SCORE_DELTA_THRESHOLD = 5;
const RESULT_RANK: Record<CheckResult, number> = { fail: 0, warn: 1, pass: 2 };

function classify(from: CheckResult, to: CheckResult): "improved" | "regressed" | "lateral" {
  if (RESULT_RANK[to] > RESULT_RANK[from]) return "improved";
  if (RESULT_RANK[to] < RESULT_RANK[from]) return "regressed";
  return "lateral";
}

interface PageLike {
  seo_results: AuditCheck[] | null | undefined;
  geo_results: AuditCheck[] | null | undefined;
}

function indexByKey(
  bucket: AuditCheck[] | null | undefined,
): Map<string, AuditCheck> {
  const map = new Map<string, AuditCheck>();
  if (!bucket) return map;
  for (const c of bucket) {
    if (!c?.key) continue;
    map.set(c.key, c);
  }
  return map;
}

/**
 * Compute per-check deltas between two snapshots of a page. Returns an
 * empty array when prior is null or both buckets are equivalent. The
 * caller decides whether to render anything.
 *
 * Rules:
 * - result_change whenever `result` flips, sorted regressions first.
 * - added when a key exists in current but not prior (engine evolved).
 * - removed when a key exists in prior but not current.
 * - score_change only when |delta| >= 5 and both sides have numeric scores
 *   AND the result didn't already flip (avoid double-counting).
 */
export function diffPage(current: PageLike, prior: PageLike | null): CheckDelta[] {
  if (!prior) return [];

  const out: CheckDelta[] = [];

  for (const bucket of ["seo_results", "geo_results"] as const) {
    const cur = indexByKey(current[bucket]);
    const pri = indexByKey(prior[bucket]);

    for (const [key, c] of cur) {
      const p = pri.get(key);
      if (!p) {
        out.push({ kind: "added", key, label: c.label, result: c.result });
        continue;
      }
      if (p.result !== c.result) {
        out.push({
          kind: "result_change",
          key,
          label: c.label,
          from: p.result,
          to: c.result,
          direction: classify(p.result, c.result),
        });
        continue;
      }
      if (typeof c.score === "number" && typeof p.score === "number") {
        const delta = c.score - p.score;
        if (Math.abs(delta) >= SCORE_DELTA_THRESHOLD) {
          out.push({
            kind: "score_change",
            key,
            label: c.label,
            from: p.score,
            to: c.score,
            delta,
          });
        }
      }
    }

    for (const [key, p] of pri) {
      if (!cur.has(key)) {
        out.push({ kind: "removed", key, label: p.label });
      }
    }
  }

  return sortDeltas(out);
}

function deltaPriority(d: CheckDelta): number {
  // Lower = render first. Regressions lead, then improvements, then engine
  // changes (added/removed), then score-only drifts.
  if (d.kind === "result_change") {
    if (d.direction === "regressed") return 0;
    if (d.direction === "improved") return 1;
    return 2;
  }
  if (d.kind === "added") return 3;
  if (d.kind === "removed") return 4;
  return 5;
}

function sortDeltas(arr: CheckDelta[]): CheckDelta[] {
  return [...arr].sort((a, b) => {
    const pa = deltaPriority(a);
    const pb = deltaPriority(b);
    if (pa !== pb) return pa - pb;
    return a.key.localeCompare(b.key);
  });
}
