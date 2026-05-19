import { DEFAULT_USER_AGENT } from "@/lib/crawler/normalize";
import { boundedText } from "@/lib/security/bounded-fetch";
import { assertSafeUrl } from "@/lib/security/ssrf";
import type { AuditCheck, AuditCheckEvidenceItem, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

const PROBE_TIMEOUT_MS = 5000;
const PROBE_MAX_BYTES = 64 * 1024;

const METHODOLOGY_PREFIX =
  "We sample up to 18 unique same-origin links from this page’s HTML and request each URL once (HEAD, falling back to GET when servers reject HEAD). " +
  "“Could not be checked” means our scanner hit a timeout, bot/WAF block, or network error—it does not prove the link is broken for visitors. ";

function probeHeaders(refererUrl: string): HeadersInit {
  return {
    Accept: "text/html,*/*",
    "User-Agent": DEFAULT_USER_AGENT,
    Referer: refererUrl,
  };
}

/**
 * HEAD/GET a small set of same-origin targets pre-collected by the
 * deterministic checker (avoids a second Cheerio parse); flags 4xx/5xx and
 * hard errors. Bounded for cost and SSRF-safe.
 */
export async function probeBrokenInternalLinks(
  targets: string[],
  refererUrl: string,
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

  async function finalizeResponse(
    target: string,
    res: Response,
    status: number,
    methodUsed: "HEAD" | "GET",
  ): Promise<ProbeOutcome> {
    if (status >= 400) {
      return { kind: "broken", url: target, status };
    }
    if (methodUsed === "GET") {
      await boundedText(res, PROBE_MAX_BYTES);
    } else {
      try {
        await res.arrayBuffer();
      } catch {
        /* ignore */
      }
    }
    return { kind: "ok" };
  }

  async function probeWithGet(
    targetUrl: string,
    headers: HeadersInit,
  ): Promise<ProbeOutcome> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers,
      });
      return finalizeResponse(targetUrl, res, res.status, "GET");
    } catch (e) {
      return {
        kind: "error",
        url: targetUrl,
        note: e instanceof Error ? e.message : "request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function probeOne(target: string): Promise<ProbeOutcome> {
    try {
      await assertSafeUrl(target);
    } catch {
      return { kind: "error", url: target, note: "blocked (safety check)" };
    }

    const headers = probeHeaders(refererUrl);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(target, {
        method: "HEAD",
        redirect: "follow",
        signal: ctrl.signal,
        headers,
      });
      const status = res.status;

      const retryWithGet =
        status === 405 || status === 501 || status === 401 || status === 403;

      if (retryWithGet) {
        try {
          await res.arrayBuffer();
        } catch {
          /* ignore */
        }
        clearTimeout(timer);
        return probeWithGet(target, headers);
      }

      return finalizeResponse(target, res, status, "HEAD");
    } catch (e) {
      clearTimeout(timer);
      const afterGet = await probeWithGet(target, headers);
      if (afterGet.kind === "error") {
        const headMsg = e instanceof Error ? e.message : "HEAD failed";
        return {
          kind: "error",
          url: target,
          note: `${headMsg}; ${afterGet.note}`,
        };
      }
      return afterGet;
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

  let result: CheckResult;
  if (broken.length >= 2) result = "fail";
  else if (broken.length === 1 || errors.length > 0) result = "warn";
  else result = "pass";

  const issueCount = broken.length + errors.length;

  const lines: string[] = [
    METHODOLOGY_PREFIX +
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
  if (broken.length === 0 && errors.length === 0) {
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
    evidence: items.length > 0 ? { totalCount: issueCount, items } : undefined,
  };
}
