import type { NextResponse } from "next/server";

/**
 * Security response headers applied at the proxy / middleware layer to every
 * response (HTML and API). Centralizing here keeps the policy reviewable in
 * one file instead of scattered across each route.
 *
 * CSP starts in **report-only** mode (`Content-Security-Policy-Report-Only`)
 * so a missed allowlist entry can't black-screen production. After a week of
 * clean reports at `/api/csp-report` we'll flip to enforcing.
 */

const HSTS = "max-age=63072000; includeSubDomains; preload";

/**
 * Permissions-Policy intentionally denies sensors and identity APIs the app
 * has no use for, and pins payment to `self` so a Stripe Elements iframe (if
 * we add one later) keeps working.
 */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=(self)",
  "publickey-credentials-get=(self)",
  "screen-wake-lock=()",
  "sync-xhr=()",
  "usb=()",
  "xr-spatial-tracking=()",
  "interest-cohort=()",
].join(", ");

/**
 * Content-Security-Policy.
 *
 * - `'unsafe-inline'`/`'unsafe-eval'` on `script-src` are required by
 *   Next.js's runtime today; tightening to nonces is a P2 follow-up.
 * - `connect-src` covers the Supabase client (HTTPS + realtime WSS for both
 *   `.supabase.co` and `.supabase.in` regions), plus Vercel Live for
 *   preview deployments. PSI / CrUX / Anthropic are only called from the
 *   server, so they don't need browser-side `connect-src` entries.
 * - `frame-ancestors 'none'` mirrors `X-Frame-Options: DENY` for browsers
 *   that prefer CSP.
 * - `report-uri /api/csp-report` collects violations so we can tighten the
 *   policy iteratively.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.in wss://*.supabase.in https://vercel.live",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data: https://vercel.live",
  "frame-src 'self' https://vercel.live",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
].join("; ");

/**
 * Apply the security header set to a `NextResponse`. Mutates and returns
 * the response for ergonomic chaining: `return applySecurityHeaders(res)`.
 *
 * Safe to call on redirect responses too — `Strict-Transport-Security`
 * etc. apply to any response with a body or just headers.
 */
export function applySecurityHeaders<T extends NextResponse>(response: T): T {
  // Note: `Strict-Transport-Security` only applies on HTTPS connections;
  // browsers ignore it over HTTP, which is what we want for local dev.
  response.headers.set("Strict-Transport-Security", HSTS);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  // Keep CSP in report-only mode until violation telemetry is clean. To
  // promote, change the header name to `Content-Security-Policy`.
  response.headers.set("Content-Security-Policy-Report-Only", CSP_DIRECTIVES);
  // Belt-and-suspenders: explicitly disable cross-origin embedding even if
  // a downstream route forgot to set CORP.
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  return response;
}
