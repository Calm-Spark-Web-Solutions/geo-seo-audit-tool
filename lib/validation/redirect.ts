/**
 * Validate a post-auth `next` redirect path. Allows only relative paths that
 * point inside this app — no schemes, no protocol-relative `//`, no nulls.
 * Returns the cleaned path or null if invalid.
 */
export function safeNextPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/\\")) return null;
  // Disallow scheme / cr-lf header injection.
  if (/[\r\n]/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed.slice(1))) return null;
  return trimmed;
}
