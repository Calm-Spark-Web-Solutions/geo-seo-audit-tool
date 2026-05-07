import axios from "axios";

import {
  DEFAULT_CRAWL_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
} from "./normalize";

export interface FetchPageOptions {
  timeoutMs?: number;
  userAgent?: string;
}

/**
 * Fetch HTML for a single URL. Returns null on non-HTML, errors, or timeouts.
 */
export async function fetchPageHtml(
  url: string,
  options: FetchPageOptions = {},
): Promise<string | null> {
  const timeout = options.timeoutMs ?? DEFAULT_CRAWL_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  try {
    const res = await axios.get(url, {
      timeout,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      responseType: "text",
      maxContentLength: 5 * 1024 * 1024,
      validateStatus: (s) => s >= 200 && s < 300,
      transitional: { clarifyTimeoutError: true },
    });
    const ct = String(res.headers["content-type"] ?? "");
    if (!ct.includes("html")) return null;
    return typeof res.data === "string" ? res.data : String(res.data);
  } catch {
    return null;
  }
}
