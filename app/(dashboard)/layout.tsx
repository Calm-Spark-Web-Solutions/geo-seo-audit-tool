import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardBody } from "@/components/layout/DashboardBody";
import { SidebarCollapseProvider } from "@/components/layout/SidebarCollapseContext";
import { Topbar } from "@/components/layout/Topbar";
import { getActiveOrgCookie } from "@/lib/active-org-cookie";
import { getAuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import { buildSidebarNavHrefs } from "@/lib/layout/sidebar-nav-hrefs";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Run independent queries in parallel — quota resolution waits for the
  // active org so the sidebar meter scopes its "used" count to the same
  // organization the /usage page shows. Without this, the sidebar reported
  // account-wide usage while /usage was org-scoped — two different numbers
  // for the same user.
  const [
    { count: memberCount },
    { data, error },
    activeOrganizationIdCookie,
  ] = await Promise.all([
    supabase
      .from("company_members")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("companies")
      .select("id, user_id, name, logo_url, contact_name, contact_email, created_at")
      .order("name", { ascending: true }),
    getActiveOrgCookie(),
  ]);

  if ((memberCount ?? 0) === 0) redirect("/onboarding");
  if (error) {
    console.warn("[dashboard] failed to load companies:", error.message);
  }
  const companies = (data ?? []) as Company[];

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };
  const account: DashboardAccount = {
    email: user.email ?? "",
    fullName: meta.full_name ?? meta.name ?? null,
    avatarUrl: meta.avatar_url ?? null,
  };

  const navHrefs = buildSidebarNavHrefs(companies, activeOrganizationIdCookie);

  const quota = await getAuditQuotaSnapshot(supabase, user.id, {
    companyId: navHrefs.orgId ?? undefined,
  });

  return (
    <SidebarCollapseProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <Topbar
          companies={companies}
          account={account}
          quota={quota}
          activeOrganizationIdCookie={activeOrganizationIdCookie}
          navHrefs={navHrefs}
        />
        <DashboardBody
          companies={companies}
          account={account}
          quota={quota}
          activeOrganizationIdCookie={activeOrganizationIdCookie}
          navHrefs={navHrefs}
        >
          {children}
        </DashboardBody>
      </div>
    </SidebarCollapseProvider>
  );
}
