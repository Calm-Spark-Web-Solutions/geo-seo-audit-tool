/** Resolve active organization for dashboard-scoped pages (URL → cookie → first). */
export function resolveDashboardOrgId(
  companies: readonly { id: string }[],
  orgParam: string | null | undefined,
  cookieOrgId: string | null | undefined,
): string | null {
  if (companies.length === 0) return null;

  const fromUrl = orgParam?.trim();
  if (fromUrl) {
    const match = companies.find((c) => c.id === fromUrl);
    if (match) return match.id;
  }

  const fromCookie = cookieOrgId?.trim();
  if (fromCookie) {
    const match = companies.find((c) => c.id === fromCookie);
    if (match) return match.id;
  }

  return companies[0]!.id;
}
