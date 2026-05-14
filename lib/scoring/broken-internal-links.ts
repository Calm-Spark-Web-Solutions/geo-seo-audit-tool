import { assertSafeUrl } from "@/lib/security/ssrf";
import { boundedText } from "@/lib/security/bounded-fetch";
import type { AuditCheck, AuditCheckEvidenceItem, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

const PROBE_TIMEOUT_MS = 5000;
const PROBE_MAX_BYTES = 64 * 1024;

/**
 * HEAD/GET a small set of same-origin targets pre-collected by the
 * deterministic checker (avoids a second Cheerio parse); flags 4xx/5xx and
 * hard errors. Bounded for cost and SSRF-safe.
 */
export async function probeBrokenInternalLinks(
  targets: string[],
): Promise<AuditCheck> {
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

  type ProbeOutcome =
    | { kind: "broken"; url: string; status: number }
    | { kind: "error"; url: string; note: string }
    | { kind: "ok" };

  async function probeOne(target: string): Promise<ProbeOutcome> {
    try {
      await assertSafeUrl(target);
    } catch {
      return { kind: "error", url: target, note: "blocked (safety check)" };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      let res = await fetch(target, {
        method: "HEAD",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Accept: "text/html,*/*" },
      });
      let status = res.status;
      if (status === 405 || status === 501) {
        try { await res.arrayBuffer(); } catch { /* ignore */ }
        res = await fetch(target, {
          method: "GET",
          redirect: "follow",
          signal: ctrl.signal,
          headers: { Accept: "text/html,*/*" },
        });
        status = res.status;
        await boundedText(res, PROBE_MAX_BYTES);
      } else if (status >= 200 && status < 400) {
        try { await res.arrayBuffer(); } catch { /* ignore */ }
      }
      return status >= 400
        ? { kind: "broken", url: target, status }
        : { kind: "ok" };
    } catch (e) {
      return { kind: "error", url: target, note: e instanceof Error ? e.message : "request failed" };
    } finally {
      clearTimeout(timer);
    }
  }

  const outcomes = await Promise.all(targets.map(probeOne));

  const broken: { url: string; status: number }[] = [];
  const errors: { url: string; note: string }[] = [];
  for (const o of outcomes) {
    if (o.kind === "broken") broken.push({ url: o.url, status: o.status });
    else if (o.kind === "error") errors.push({ url: o.url, note: o.note });
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
