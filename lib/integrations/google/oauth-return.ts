/**
 * Validate OAuth return path. Only `/integrations/google?org=<companyId>` is
 * supported now; the legacy `/companies/<id>#google-integrations` branch has
 * been removed because that anchor no longer exists on the company page.
 */
export function normalizeOAuthReturnTo(
  returnTo: string | null | undefined,
  companyId: string,
): string | null {
  if (!returnTo?.trim()) return null;
  const trimmed = returnTo.trim();
  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (pathOnly !== "/integrations/google") return null;
  try {
    const u = new URL(trimmed, "http://local");
    const org = u.searchParams.get("org");
    if (org && org !== companyId) return null;
  } catch {
    return null;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function oauthSuccessReturnPath(
  returnTo: string | null,
  companyId: string,
): string {
  // Always return to the canonical integrations hub. The success flash is
  // rendered from the `google=connected` query param.
  void normalizeOAuthReturnTo(returnTo, companyId);
  return `/integrations/google?org=${encodeURIComponent(companyId)}&google=connected`;
}

export function oauthErrorReturnPath(
  returnTo: string | null,
  companyId: string,
  reason: string,
): string {
  void normalizeOAuthReturnTo(returnTo, companyId);
  const q = `google=error&reason=${encodeURIComponent(reason)}`;
  return `/integrations/google?org=${encodeURIComponent(companyId)}&${q}`;
}
