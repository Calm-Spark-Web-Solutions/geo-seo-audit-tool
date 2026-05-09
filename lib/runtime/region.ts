/**
 * Canonical region reference for the audit API routes that talk to
 * Supabase. Pinning the function close to the database eliminates 50–200 ms
 * of round-trip latency per Supabase call, which compounds during the audit
 * runner's per-page reads/writes.
 *
 * IMPORTANT: Next.js's route-segment-config analyzer requires the
 * `preferredRegion` export to be a **string literal** in the route file
 * itself — it cannot follow cross-module imports. So this file is the
 * documentation pointer, not the runtime source. When you change regions,
 * update this comment AND the literal in each of these routes:
 *
 *   - app/api/audits/[id]/run/route.ts
 *   - app/api/audits/cron-tick/route.ts
 *   - app/api/audits/[id]/snapshot/route.ts
 *   - app/api/audits/[id]/report.pdf/route.ts
 *
 * Common Supabase → Vercel region matches:
 *   - us-east-1 (default)        →  "iad1"  (Washington, D.C.)
 *   - eu-west-1                  →  "dub1"  (Dublin)
 *   - ap-southeast-1 (Singapore) →  "sin1"
 *   - ap-southeast-2 (Sydney)    →  "syd1"
 *   - ap-northeast-1 (Tokyo)     →  "hnd1"
 *
 * The full Vercel region list lives at
 * https://vercel.com/docs/edge-network/regions.
 */
export const PREFERRED_REGION = "iad1" as const;
