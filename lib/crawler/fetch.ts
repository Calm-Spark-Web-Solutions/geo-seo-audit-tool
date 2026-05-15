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

export interface FetchPageOptions {
  timeoutMs?: number;
  userAgent?: string;
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

/** Structured diagnosis when HTML fetch gives up (no secrets / minimal PII). */
function logAuditFetchFailure(args: {
  requestUrl: string;
  reason: string;
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
 * Fetch HTML with manual redirect handling so we can record hop count,
 * statuses, and loop detection. SSRF-guarded on every hop.
 */
export async function fetchPageWithMeta(
  startUrl: string,
  options: FetchPageOptions = {},
): Promise<FetchPageWithMetaResult | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const deadline = Date.now() + timeoutMs;

  const chain: { url: string; status: number }[] = [];
  let current = startUrl;
  const visited = new Set<string>();

  try {
    await assertSafeUrl(startUrl);
  } catch {
    logAuditFetchFailure({
      requestUrl: startUrl,
      reason: "ssrf_guard_rejected",
    });
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (Date.now() > deadline) {
      logAuditFetchFailure({
        requestUrl: current,
        reason: "deadline_exceeded",
      });
      return null;
    }

    try {
      await assertSafeUrl(current);
    } catch {
      logAuditFetchFailure({
        requestUrl: current,
        reason: "ssrf_guard_rejected",
      });
      return null;
    }

    if (visited.has(current)) {
      logAuditFetchFailure({
        requestUrl: current,
        reason: "redirect_chain_duplicate",
      });
      return null;
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
      logAuditFetchFailure({
        requestUrl: current,
        reason: "fetch_network_or_abort",
      });
      return null;
    }

    const status = res.status;
    chain.push({ url: current, status });

    if (status >= 200 && status < 300) {
      const ct = String(res.headers["content-type"] ?? "");
      if (!ct.includes("html")) {
        logAuditFetchFailure({
          requestUrl: current,
          reason: "non_html_content_type",
          status,
          contentType: ct,
        });
        return null;
      }
      const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
      const responseHeadersLower: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === "string") responseHeadersLower[k.toLowerCase()] = v;
      }
      const finalUrl = current;
      const redirectHopCount = Math.max(0, chain.length - 1);
      return {
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
        logAuditFetchFailure({
          requestUrl: current,
          reason: "redirect_missing_location",
          status,
        });
        return null;
      }
      let next: string;
      try {
        next = new URL(loc, current).href;
      } catch {
        logAuditFetchFailure({
          requestUrl: current,
          reason: "redirect_location_invalid",
          status,
        });
        return null;
      }
      if (visited.has(next)) {
        chain.push({ url: next, status: 0 });
        logAuditFetchFailure({
          requestUrl: next,
          reason: "redirect_target_revisit",
          status,
        });
        return null;
      }
      current = next;
      continue;
    }

    logAuditFetchFailure({
      requestUrl: current,
      reason: "http_non_success",
      status,
    });
    return null;
  }

  logAuditFetchFailure({
    requestUrl: startUrl,
    reason: "redirect_max_hops_exceeded",
  });
  return null;
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
