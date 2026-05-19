import axios from "axios";

import { devRunnerConsole } from "@/lib/audit/dev-runner-console";
import { observabilityLog } from "@/lib/observability/log";
import { assertSafeUrl } from "@/lib/security/ssrf";

import {
  DEFAULT_CRAWL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
} from "./normalize";

const HTML_MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECT_HOPS = 8;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_FETCH_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [0, 600, 1200];

export type FetchPageFailureReason =
  | "ssrf_guard_rejected"
  | "deadline_exceeded"
  | "redirect_chain_duplicate"
  | "fetch_network_or_abort"
  | "non_html_content_type"
  | "redirect_missing_location"
  | "redirect_location_invalid"
  | "redirect_target_revisit"
  | "http_non_success"
  | "redirect_max_hops_exceeded";

const RETRYABLE_FAILURE_REASONS = new Set<FetchPageFailureReason>([
  "fetch_network_or_abort",
  "deadline_exceeded",
]);

export interface FetchPageOptions {
  timeoutMs?: number;
  userAgent?: string;
  /** Transient network/timeouts are retried up to this many attempts. */
  maxAttempts?: number;
}

export interface PageFetchMeta {
  /** Final URL after redirects (same as initial when no redirect). */
  finalUrl: string;
  /** Number of redirect responses followed (0 = direct 200). */
  redirectHopCount: number;
  /** Each hop: request URL and HTTP status returned before following. */
  redirectChain: { url: string; status: number }[];
  /** True when a redirect target repeats a URL already seen in the chain. */
  redirectLoop: boolean;
  /** Response headers from the final HTML response (lowercase keys). */
  responseHeadersLower: Record<string, string>;
}

export interface FetchPageWithMetaResult {
  html: string;
  meta: PageFetchMeta;
}

export type FetchPageOutcome =
  | { ok: true; html: string; meta: PageFetchMeta }
  | { ok: false; reason: FetchPageFailureReason };

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function safePathnameDev(url: string): string | undefined {
  if (process.env.NODE_ENV !== "development") return undefined;
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Structured diagnosis when HTML fetch gives up (no secrets / minimal PII). */
function logAuditFetchFailure(args: {
  requestUrl: string;
  reason: FetchPageFailureReason;
  status?: number;
  contentType?: string;
}): void {
  const hostname = safeHostname(args.requestUrl);
  observabilityLog.warn("audit.fetch.page_failed", {
    hostname,
    reason: args.reason,
    ...(args.status !== undefined ? { httpStatus: args.status } : {}),
    ...(args.contentType !== undefined
      ? { contentTypePrefix: args.contentType.slice(0, 120) }
      : {}),
  });
  const pathnameDev = safePathnameDev(args.requestUrl);
  devRunnerConsole("fetchPageWithMeta failed", {
    hostname,
    reason: args.reason,
    httpStatus: args.status,
    ...(pathnameDev !== undefined ? { pathname: pathnameDev } : {}),
  });
}

/**
 * Single fetch attempt with manual redirect handling. Does not log or retry.
 */
async function fetchPageWithMetaOnce(
  startUrl: string,
  options: FetchPageOptions = {},
): Promise<FetchPageOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const deadline = Date.now() + timeoutMs;

  const chain: { url: string; status: number }[] = [];
  let current = startUrl;
  const visited = new Set<string>();

  try {
    await assertSafeUrl(startUrl);
  } catch {
    return { ok: false, reason: "ssrf_guard_rejected" };
  }

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (Date.now() > deadline) {
      return { ok: false, reason: "deadline_exceeded" };
    }

    try {
      await assertSafeUrl(current);
    } catch {
      return { ok: false, reason: "ssrf_guard_rejected" };
    }

    if (visited.has(current)) {
      return { ok: false, reason: "redirect_chain_duplicate" };
    }
    visited.add(current);

    const hopTimeout = Math.max(800, deadline - Date.now());

    // Use axios (same HTTP client as the sitemap fetcher) so both share the
    // same TLS fingerprint. Native fetch (undici) uses a different JA3/JA4
    // fingerprint that some WAFs/CDNs block at the TCP level before sending
    // any HTTP response.
    let res: Awaited<ReturnType<typeof axios.get<string>>>;
    try {
      res = await axios.get<string>(current, {
        timeout: hopTimeout,
        maxRedirects: 0,
        validateStatus: () => true,
        responseType: "text",
        maxContentLength: HTML_MAX_BYTES,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        decompress: true,
      });
    } catch {
      return { ok: false, reason: "fetch_network_or_abort" };
    }

    const status = res.status;
    chain.push({ url: current, status });

    if (status >= 200 && status < 300) {
      const ct = String(res.headers["content-type"] ?? "");
      if (!ct.includes("html")) {
        return { ok: false, reason: "non_html_content_type" };
      }
      const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
      const responseHeadersLower: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === "string") responseHeadersLower[k.toLowerCase()] = v;
      }
      const finalUrl = current;
      const redirectHopCount = Math.max(0, chain.length - 1);
      return {
        ok: true,
        html: text,
        meta: {
          finalUrl,
          redirectHopCount,
          redirectChain: chain,
          redirectLoop: false,
          responseHeadersLower,
        },
      };
    }

    if (REDIRECT_STATUSES.has(status)) {
      const loc = (res.headers["location"] as string | undefined)?.trim();
      if (!loc) {
        return { ok: false, reason: "redirect_missing_location" };
      }
      let next: string;
      try {
        next = new URL(loc, current).href;
      } catch {
        return { ok: false, reason: "redirect_location_invalid" };
      }
      if (visited.has(next)) {
        return { ok: false, reason: "redirect_target_revisit" };
      }
      current = next;
      continue;
    }

    return { ok: false, reason: "http_non_success" };
  }

  return { ok: false, reason: "redirect_max_hops_exceeded" };
}

/**
 * Fetch HTML with retries on transient network/timeouts. Returns structured
 * success or failure (including the final failure reason).
 */
export async function tryFetchPageWithMeta(
  startUrl: string,
  options: FetchPageOptions = {},
): Promise<FetchPageOutcome> {
  const maxAttempts = Math.max(
    1,
    options.maxAttempts ?? DEFAULT_FETCH_ATTEMPTS,
  );
  let last: FetchPageOutcome = { ok: false, reason: "fetch_network_or_abort" };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoff =
        RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      await sleep(backoff);
    }
    last = await fetchPageWithMetaOnce(startUrl, options);
    if (last.ok) return last;
    if (!RETRYABLE_FAILURE_REASONS.has(last.reason)) break;
  }

  if (!last.ok) {
    logAuditFetchFailure({
      requestUrl: startUrl,
      reason: last.reason,
    });
  }
  return last;
}

/**
 * Fetch HTML with manual redirect handling so we can record hop count,
 * statuses, and loop detection. SSRF-guarded on every hop.
 */
export async function fetchPageWithMeta(
  startUrl: string,
  options: FetchPageOptions = {},
): Promise<FetchPageWithMetaResult | null> {
  const outcome = await tryFetchPageWithMeta(startUrl, options);
  if (!outcome.ok) return null;
  return { html: outcome.html, meta: outcome.meta };
}

/**
 * Fetch HTML for a single URL. Returns null on non-HTML, errors, timeouts,
 * or SSRF-guard rejections.
 */
export async function fetchPageHtml(
  url: string,
  options: FetchPageOptions = {},
): Promise<string | null> {
  const got = await fetchPageWithMeta(url, options);
  return got?.html ?? null;
}
