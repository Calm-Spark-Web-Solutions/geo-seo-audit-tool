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
 * otherwise first company in their list.
 */
export function selectedOrganizationId(
  companies: Company[],
  params: { id?: string | string[] },
  pathname: string,
): string | null {
  if (companies.length === 0) return null;
  const activeId = resolveActiveCompanyId(params, pathname);
  if (activeId) {
    const match = companies.find((c) => c.id === activeId);
    if (match) return match.id;
  }
  return companies[0].id;
}
