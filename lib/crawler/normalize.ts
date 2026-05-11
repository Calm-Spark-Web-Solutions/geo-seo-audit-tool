export const MAX_PAGES = 50;

export const ASSET_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico",
  ".pdf", ".zip", ".gz", ".tar", ".rar", ".7z",
  ".mp4", ".mov", ".webm", ".mp3", ".wav", ".ogg",
  ".css", ".js", ".map", ".xml", ".json", ".rss", ".atom",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
];

export const DEFAULT_CRAWL_TIMEOUT_MS = 10_000;
export const DEFAULT_USER_AGENT =
  "RankLumeBot/1.0 (+https://ranklume.com)";

/**
 * Normalize a URL for dedupe: lowercase host, drop fragment, drop trailing slash
 * (except root), drop default ports. Returns null on invalid URL or non-http(s).
 */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export function isAssetUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const lower = pathname.toLowerCase();
    return ASSET_EXTENSIONS.some((ext) => lower.endsWith(ext));
  } catch {
    return false;
  }
}

export function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin;
  } catch {
    return false;
  }
}

export function originOf(input: string): string | null {
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}
