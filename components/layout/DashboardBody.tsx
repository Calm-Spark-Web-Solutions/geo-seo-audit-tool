"use client";

import { cn } from "@/lib/utils";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import type { Company } from "@/types";

import { Sidebar } from "@/components/layout/Sidebar";
import { useSidebarCollapsed } from "@/components/layout/SidebarCollapseContext";

export function DashboardBody({
  companies,
  account,
  quota,
  activeOrganizationIdCookie,
  children,
}: {
  companies: Company[];
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
  /** From `rl_active_org`; aligns sidebar with dashboard org scope off `/companies/[id]`. */
  activeOrganizationIdCookie: string | null;
  children: React.ReactNode;
}) {
  const { collapsed, hydrated } = useSidebarCollapsed();

  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 grid-cols-1 md:items-stretch",
        hydrated && collapsed
          ? "md:grid-cols-[4rem_minmax(0,1fr)]"
          : "md:grid-cols-[15rem_minmax(0,1fr)]",
      )}
    >
      <Sidebar
        companies={companies}
        account={account}
        quota={quota}
        activeOrganizationIdCookie={activeOrganizationIdCookie}
      />
      <main
        id="main"
        className="min-w-0 px-4 py-4 md:px-8 md:pt-5 md:pb-8"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {children}
        </div>
      </main>
    </div>
  );
}
