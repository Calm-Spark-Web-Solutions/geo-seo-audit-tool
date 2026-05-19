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

/**
 * WordPress and similar CMSes often 301 bare paths to a trailing slash. Request
 * the slash up front so redirect-heavy fetches stay within the timeout budget.
 */
export function preferTrailingSlashFetchUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname.endsWith("/")) return url;
    u.pathname = `${u.pathname}/`;
    return u.toString();
  } catch {
    return url;
  }
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

/**
 * True when both URLs use http(s), share the same scheme and port, and their
 * hostnames match after stripping a single leading `www.` label (apex ↔ www).
 * Used for audit allowlists, sitemap/crawl guards, and form validation where
 * the strict WHATWG origin would falsely reject the site's canonical alias.
 */
export function sameAuditSiteOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    // Both must be http(s)
    if (ua.protocol !== "http:" && ua.protocol !== "https:") return false;
    if (ub.protocol !== "http:" && ub.protocol !== "https:") return false;
    // Port must match when both are the same protocol. When protocols differ
    // (e.g. community stored as http:// but sitemap returns https:// URLs)
    // we treat them as the same site — the actual fetch will follow the
    // http→https redirect. Only compare ports when they are explicit and
    // non-default for the respective scheme.
    const portA = ua.port || (ua.protocol === "https:" ? "443" : "80");
    const portB = ub.port || (ub.protocol === "https:" ? "443" : "80");
    if (ua.protocol === ub.protocol && portA !== portB) return false;
    const ha = ua.hostname.replace(/^www\./i, "");
    const hb = ub.hostname.replace(/^www\./i, "");
    return ha.toLowerCase() === hb.toLowerCase();
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
