/**
 * Shared Lighthouse / PageSpeed Insights identifiers used by:
 *
 *   - `components/audits/LighthouseSection.tsx` (empty-state predicate)
 *   - `lib/audit/refresh-audit-page.ts` (strip PSI rows before re-merge)
 *   - `lib/audit/psi-retry.ts` (post-scan auto-retry pass)
 *
 * Kept dependency-free so client and server callers can import without
 * pulling Supabase or other server-only modules.
 */

import type { AuditCheck } from "@/types";

export const PSI_CATEGORY_KEYS = [
  "psi_performance",
  "psi_accessibility",
  "psi_best_practices",
  "psi_seo",
] as const;

export type PsiCategoryKey = (typeof PSI_CATEGORY_KEYS)[number];

/**
 * True when at least one of the four Lighthouse category tiles is present
 * in the combined check array. Mirrors the `tiles.length === 0` empty-state
 * check rendered by `LighthouseSection`, so "missing PSI" decisions made
 * server-side stay 1:1 with what the user sees.
 */
export function hasPsiCategories(checks: AuditCheck[]): boolean {
  if (!Array.isArray(checks) || checks.length === 0) return false;
  return checks.some((c) =>
    (PSI_CATEGORY_KEYS as readonly string[]).includes(c.key),
  );
}
