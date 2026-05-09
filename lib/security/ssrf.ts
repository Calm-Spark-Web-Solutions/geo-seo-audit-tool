import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * SSRF guard for outbound fetches against user-supplied URLs.
 *
 * Why: the audit runner fetches arbitrary URLs (the audited site, its
 * sitemaps, its `robots.txt`). Without a guard, an attacker could create an
 * audit for `http://169.254.169.254/latest/meta-data/iam/security-credentials/`
 * (AWS instance metadata), `http://localhost:54321/` (hit a sibling Supabase
 * instance), or a hostile DNS name that resolves into a private range.
 *
 * The guard runs as a **preflight** before any socket opens. There is a
 * theoretical TOCTOU between this DNS lookup and the actual connection
 * (DNS rebinding) — closing that gap requires pinning to the resolved IP
 * via a custom `httpsAgent.lookup` callback. That's a deliberate follow-up;
 * the preflight covers the realistic attacker surface today.
 */

export class SsrfBlockedError extends Error {
  constructor(reason: string, public readonly input: string) {
    super(`SSRF guard rejected URL: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

/** Hostnames that should never resolve. Some local resolvers shadow these. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.azure.com",
  "metadata",
]);

interface IPv4Range {
  cidr: string;
  match: (octets: [number, number, number, number]) => boolean;
}

/**
 * Block list mirrors IANA special-use registries (RFC 6890 / 8190 / 6598)
 * plus the cloud metadata link-local range. Each predicate is the cheapest
 * possible check that mirrors the CIDR.
 */
const IPV4_BLOCKED: IPv4Range[] = [
  { cidr: "0.0.0.0/8", match: (o) => o[0] === 0 },
  { cidr: "10.0.0.0/8", match: (o) => o[0] === 10 },
  { cidr: "100.64.0.0/10", match: (o) => o[0] === 100 && o[1] >= 64 && o[1] <= 127 },
  { cidr: "127.0.0.0/8", match: (o) => o[0] === 127 },
  { cidr: "169.254.0.0/16", match: (o) => o[0] === 169 && o[1] === 254 },
  { cidr: "172.16.0.0/12", match: (o) => o[0] === 172 && o[1] >= 16 && o[1] <= 31 },
  { cidr: "192.0.0.0/24", match: (o) => o[0] === 192 && o[1] === 0 && o[2] === 0 },
  { cidr: "192.168.0.0/16", match: (o) => o[0] === 192 && o[1] === 168 },
  { cidr: "198.18.0.0/15", match: (o) => o[0] === 198 && (o[1] === 18 || o[1] === 19) },
  { cidr: "224.0.0.0/4 (multicast)", match: (o) => o[0] >= 224 && o[0] <= 239 },
  { cidr: "240.0.0.0/4 (reserved)", match: (o) => o[0] >= 240 },
  { cidr: "255.255.255.255 (broadcast)", match: (o) => o[0] === 255 && o[1] === 255 && o[2] === 255 && o[3] === 255 },
];

function parseIPv4(addr: string): [number, number, number, number] | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    out.push(n);
  }
  return out as [number, number, number, number];
}

function ipv4Blocked(addr: string): { blocked: boolean; reason?: string } {
  const octets = parseIPv4(addr);
  if (!octets) return { blocked: false };
  for (const range of IPV4_BLOCKED) {
    if (range.match(octets)) return { blocked: true, reason: `IPv4 in ${range.cidr}` };
  }
  return { blocked: false };
}

/**
 * Reject IPv6 loopback, link-local, unique-local, multicast, and the
 * IPv4-mapped transition range as a class.
 *
 * Note on IPv4-mapped: WHATWG URL canonicalizes `::ffff:127.0.0.1` into
 * the hex form `::ffff:7f00:1`, which a naive regex against the dotted
 * form would miss. Rather than parse both forms back into an IPv4 octet
 * tuple, we reject the entire `::ffff:0:0/96` range. The cost is rejecting
 * dual-stack public IPs expressed in mapped notation, which has no
 * legitimate use for outbound user-supplied URLs.
 */
function ipv6Blocked(addr: string): { blocked: boolean; reason?: string } {
  const lower = addr.toLowerCase();
  if (lower === "::1" || lower === "::") return { blocked: true, reason: "IPv6 loopback/unspecified" };
  if (lower.startsWith("fe80:") || lower.startsWith("fe8")) return { blocked: true, reason: "IPv6 link-local fe80::/10" };
  if (lower.startsWith("fc") || lower.startsWith("fd")) return { blocked: true, reason: "IPv6 unique-local fc00::/7" };
  if (lower.startsWith("ff")) return { blocked: true, reason: "IPv6 multicast ff00::/8" };
  if (lower.startsWith("::ffff:")) {
    return { blocked: true, reason: "IPv4-mapped IPv6 ::ffff:0:0/96" };
  }
  return { blocked: false };
}

function ipBlocked(addr: string): { blocked: boolean; reason?: string } {
  const family = isIP(addr);
  if (family === 4) return ipv4Blocked(addr);
  if (family === 6) return ipv6Blocked(addr);
  return { blocked: false };
}

/**
 * Validate a URL is safe to fetch from a server-side context.
 *
 * Rejects when:
 *  - protocol is not `http:` or `https:`
 *  - hostname is a blocked literal (`localhost`, cloud metadata names)
 *  - hostname is an IP literal in a blocked range
 *  - hostname resolves (any A/AAAA record) to a blocked IP
 *
 * Returns the parsed `URL` so callers can use the canonicalized form.
 *
 * @throws {SsrfBlockedError} on any rejection so callers can log the reason.
 */
export async function assertSafeUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SsrfBlockedError("invalid URL", input);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`unsupported protocol "${url.protocol}"`, input);
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfBlockedError(`blocked hostname "${hostname}"`, input);
  }

  // Hostname is itself an IP literal — no DNS, just check the literal.
  if (isIP(hostname)) {
    const { blocked, reason } = ipBlocked(hostname);
    if (blocked) throw new SsrfBlockedError(reason ?? "blocked IP literal", input);
    return url;
  }

  // DNS resolve and check every A/AAAA. Hostile domains can return a mix
  // (e.g. one public IP + one private to bypass naive checks); we reject
  // if **any** address is unsafe.
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new SsrfBlockedError(
      `DNS lookup failed (${(e as Error).message})`,
      input,
    );
  }

  if (addrs.length === 0) {
    throw new SsrfBlockedError("DNS lookup returned no records", input);
  }

  for (const { address } of addrs) {
    const { blocked, reason } = ipBlocked(address);
    if (blocked) {
      throw new SsrfBlockedError(
        `host ${hostname} resolves to ${address} (${reason})`,
        input,
      );
    }
  }

  return url;
}

/**
 * Convenience wrapper: returns `null` when the URL is unsafe instead of
 * throwing. Use this in places that already swallow fetch failures into
 * `null` (the crawler's `safeFetch` pattern) so the unsafe-URL signal gets
 * the same gentle treatment as a network error.
 */
export async function isSafeUrl(input: string): Promise<boolean> {
  try {
    await assertSafeUrl(input);
    return true;
  } catch {
    return false;
  }
}
