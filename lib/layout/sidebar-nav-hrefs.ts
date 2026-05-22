import { resolveDashboardOrgId } from "@/lib/layout/resolve-dashboard-org";

export type SidebarNavHrefs = {
  dashboard: string;
  usage: string;
  google: string;
  orgId: string | null;
};

/** Build sidebar primary nav links on the server so SSR matches client hydration. */
export function buildSidebarNavHrefs(
  companies: readonly { id: string }[],
  activeOrganizationIdCookie: string | null,
): SidebarNavHrefs {
  const orgId = resolveDashboardOrgId(
    companies,
    null,
    activeOrganizationIdCookie,
  );
  if (!orgId) {
    return {
      orgId: null,
      dashboard: "/dashboard",
      usage: "/usage",
      google: "/integrations/google",
    };
  }
  const q = `?org=${encodeURIComponent(orgId)}`;
  return {
    orgId,
    dashboard: `/dashboard${q}`,
    usage: `/usage${q}`,
    google: `/integrations/google${q}`,
  };
}
