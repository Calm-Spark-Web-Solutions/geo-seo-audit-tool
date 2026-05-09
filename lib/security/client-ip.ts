import { isIP } from "node:net";

/**
 * Extract the client IP from request headers for IP-keyed rate-limit
 * buckets (sign-in, sign-up). Vercel sets `x-forwarded-for` with the real
 * client IP as the first hop.
 *
 * Validates the result is a syntactic IP literal so a malicious header
 * can't poison the bucket key (Postgres `text` doesn't care, but keeping
 * keys to a known shape makes log triage cleaner).
 *
 * Returns `null` if no usable IP is present — callers should fall back to
 * a generic key (e.g. the form action path) rather than skipping the
 * rate limit entirely.
 */
export function getClientIp(reqHeaders: Headers): string | null {
  const xff = reqHeaders.get("x-forwarded-for")?.trim();
  if (xff) {
    // Take the first hop; later hops are proxy chain entries.
    const first = xff.split(",")[0]?.trim();
    if (first && isIP(first)) return first;
  }

  // Vercel also exposes the client IP via `x-real-ip`.
  const real = reqHeaders.get("x-real-ip")?.trim();
  if (real && isIP(real)) return real;

  return null;
}
