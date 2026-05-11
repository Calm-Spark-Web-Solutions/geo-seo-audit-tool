import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardBody } from "@/components/layout/DashboardBody";
import { SidebarCollapseProvider } from "@/components/layout/SidebarCollapseContext";
import { Topbar } from "@/components/layout/Topbar";
import { loadDashboardAccount } from "@/lib/layout/dashboard-account";
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

  const { count: memberCount } = await supabase
    .from("company_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((memberCount ?? 0) === 0) redirect("/onboarding");

  const { data, error } = await supabase
    .from("companies")
    .select("id, user_id, name, logo_url, contact_name, contact_email, created_at")
    .order("name", { ascending: true });
  if (error) {
    console.warn("[dashboard] failed to load companies:", error.message);
  }
  const companies = (data ?? []) as Company[];

  const { account, quota } = await loadDashboardAccount();

  return (
    <SidebarCollapseProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <Topbar companies={companies} account={account} quota={quota} />
        <DashboardBody
          companies={companies}
          account={account}
          quota={quota}
        >
          {children}
        </DashboardBody>
      </div>
    </SidebarCollapseProvider>
  );
}
