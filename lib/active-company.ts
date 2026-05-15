import type { Company } from "@/types";

/** Active company id from URL when path is under `/companies/[id]/…`. */
export function resolveActiveCompanyId(
  params: { id?: string | string[] },
  pathname: string,
): string | null {
  if (!pathname.startsWith("/companies/")) return null;
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

/**
 * Selected organization for sidebar/switcher: URL company when valid for the user,
 * otherwise persisted cookie id (`rl_active_org`) when valid, otherwise first company.
 */
export function selectedOrganizationId(
  companies: Company[],
  params: { id?: string | string[] },
  pathname: string,
  persistedOrgId?: string | null,
): string | null {
  if (companies.length === 0) return null;
  const activeId = resolveActiveCompanyId(params, pathname);
  if (activeId) {
    const match = companies.find((c) => c.id === activeId);
    if (match) return match.id;
  }
  if (persistedOrgId) {
    const persisted = companies.find((c) => c.id === persistedOrgId);
    if (persisted) return persisted.id;
  }
  return companies[0]!.id;
}
