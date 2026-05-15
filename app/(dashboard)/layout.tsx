import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardBody } from "@/components/layout/DashboardBody";
import { SidebarCollapseProvider } from "@/components/layout/SidebarCollapseContext";
import { Topbar } from "@/components/layout/Topbar";
import { getActiveOrgCookie } from "@/lib/active-org-cookie";
import { getAuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
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

  // Run all three independent queries in parallel — previously they were
  // sequential (memberCount → companies → loadDashboardAccount which called
  // getUser() a second time). This shaves ~100–300 ms off every page load.
  const [
    { count: memberCount },
    { data, error },
    quota,
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
    getAuditQuotaSnapshot(supabase, user.id),
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

  return (
    <SidebarCollapseProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <Topbar
          companies={companies}
          account={account}
          quota={quota}
          activeOrganizationIdCookie={activeOrganizationIdCookie}
        />
        <DashboardBody
          companies={companies}
          account={account}
          quota={quota}
          activeOrganizationIdCookie={activeOrganizationIdCookie}
        >
          {children}
        </DashboardBody>
      </div>
    </SidebarCollapseProvider>
  );
}
