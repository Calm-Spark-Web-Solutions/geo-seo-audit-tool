/** Validate OAuth return path: must be the same company detail page. */
export function normalizeOAuthReturnTo(
  returnTo: string | null | undefined,
  companyId: string,
): string | null {
  if (!returnTo?.trim()) return null;
  const trimmed = returnTo.trim();
  const pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "";
  const expected = `/companies/${companyId}`;
  if (pathOnly !== expected) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function oauthSuccessReturnPath(
  returnTo: string | null,
  companyId: string,
): string {
  const base = normalizeOAuthReturnTo(returnTo, companyId);
  if (base) {
    const path = base.split("?")[0] ?? base;
    return `${path}?google=connected#google-integrations`;
  }
  return "/settings?tab=organizations&google=connected";
}

export function oauthErrorReturnPath(
  returnTo: string | null,
  companyId: string,
  reason: string,
): string {
  const base = normalizeOAuthReturnTo(returnTo, companyId);
  const q = `google=error&reason=${encodeURIComponent(reason)}`;
  if (base) {
    const path = base.split("?")[0] ?? base;
    return `${path}?${q}#google-integrations`;
  }
  return `/settings?tab=organizations&${q}`;
}
