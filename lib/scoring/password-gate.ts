/**
 * Heuristic: HTML looks like a WordPress or generic password gate rather than
 * public indexable content. Used to default `exclude_from_audit_score` on ingest.
 * Reviewers can undo per-page if misclassified.
 */
export function detectLikelyPasswordGate(html: string): boolean {
  const sample = html.slice(0, 80_000).toLowerCase();
  if (/password\s+protected/.test(sample)) return true;
  if (/enter the password below/.test(sample)) return true;
  if (/to view this protected post/.test(sample)) return true;
  if (/protected\s+content/.test(sample) && /password/i.test(html)) return true;
  // WordPress post-password form
  if (/post-password-form|name=["']post_password["']/i.test(html)) return true;
  return false;
}
