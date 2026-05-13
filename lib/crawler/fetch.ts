import { boundedText } from "@/lib/security/bounded-fetch";
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

function headersToRecord(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
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
  let redirectLoop = false;

  try {
    await assertSafeUrl(startUrl);
  } catch {
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (Date.now() > deadline) {
      return null;
    }

    try {
      await assertSafeUrl(current);
    } catch {
      return null;
    }

    if (visited.has(current)) {
      redirectLoop = true;
      break;
    }
    visited.add(current);

    const hopTimeout = Math.max(800, deadline - Date.now());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), hopTimeout);

    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      clearTimeout(timer);
      return null;
    } finally {
      clearTimeout(timer);
    }

    const status = res.status;
    chain.push({ url: current, status });

    if (status >= 200 && status < 300) {
      const ct = String(res.headers.get("content-type") ?? "");
      if (!ct.includes("html")) {
        return null;
      }
      const { text } = await boundedText(res, HTML_MAX_BYTES);
      const responseHeadersLower = headersToRecord(res.headers);
      const finalUrl = current;
      const redirectHopCount = Math.max(0, chain.length - 1);
      return {
        html: text,
        meta: {
          finalUrl,
          redirectHopCount,
          redirectChain: chain,
          redirectLoop,
          responseHeadersLower,
        },
      };
    }

    if (REDIRECT_STATUSES.has(status)) {
      const loc = res.headers.get("location")?.trim();
      try {
        await res.arrayBuffer();
      } catch {
        // ignore body drain errors
      }
      if (!loc) {
        return null;
      }
      let next: string;
      try {
        next = new URL(loc, current).href;
      } catch {
        return null;
      }
      if (visited.has(next)) {
        redirectLoop = true;
        chain.push({ url: next, status: 0 });
        return null;
      }
      current = next;
      continue;
    }

    return null;
  }

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
