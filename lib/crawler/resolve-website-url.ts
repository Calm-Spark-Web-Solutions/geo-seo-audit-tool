import axios from "axios";

import { assertSafeUrl } from "@/lib/security/ssrf";

import { DEFAULT_USER_AGENT, normalizeUrl } from "./normalize";

const RESOLVE_TIMEOUT_MS = 8_000;

export type ResolveWebsiteUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Probe http and https variants and return a reachable, normalized homepage URL.
 * Prefers https when both schemes respond.
 */
export async function resolveCanonicalWebsiteUrl(
  raw: string,
): Promise<ResolveWebsiteUrlResult> {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: "Must be a valid URL." };
  }

  let host: string;
  let pathAndSearch: string;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Must be a valid URL." };
    }
    host = parsed.hostname.toLowerCase();
    pathAndSearch = `${parsed.pathname || "/"}${parsed.search}`;
  } catch {
    return { ok: false, error: "Must be a valid URL." };
  }

  const candidates = [
    `https://${host}${pathAndSearch}`,
    `http://${host}${pathAndSearch}`,
  ].filter((url, index, all) => all.indexOf(url) === index);

  for (const candidate of candidates) {
    const finalUrl = await probeReachableUrl(candidate);
    if (finalUrl) {
      const normalized = normalizeUrl(finalUrl);
      if (normalized) return { ok: true, url: normalized };
    }
  }

  return {
    ok: false,
    error: "Could not reach this website. Check the URL and try again.",
  };
}

async function probeReachableUrl(url: string): Promise<string | null> {
  const head = await tryRequest(url, "head");
  if (head) return head;
  return tryRequest(url, "get");
}

async function tryRequest(
  url: string,
  method: "head" | "get",
): Promise<string | null> {
  try {
    await assertSafeUrl(url);
    const res =
      method === "head"
        ? await axios.head(url, requestOptions())
        : await axios.get<string>(url, {
            ...requestOptions(),
            responseType: "text",
            maxContentLength: 64 * 1024,
          });

    if (res.status < 200 || res.status >= 400) return null;

    const finalUrl = extractFinalUrl(res, url);
    await assertSafeUrl(finalUrl);
    return finalUrl;
  } catch {
    return null;
  }
}

function requestOptions() {
  return {
    timeout: RESOLVE_TIMEOUT_MS,
    maxRedirects: 5,
    validateStatus: (status: number) => status >= 200 && status < 400,
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,*/*",
    },
  };
}

function extractFinalUrl(
  res: { request?: { res?: { responseUrl?: string } }; config?: { url?: string } },
  fallback: string,
): string {
  const fromResponse = res.request?.res?.responseUrl;
  if (typeof fromResponse === "string" && fromResponse.length > 0) {
    return fromResponse;
  }
  const fromConfig = res.config?.url;
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    return fromConfig;
  }
  return fallback;
}
