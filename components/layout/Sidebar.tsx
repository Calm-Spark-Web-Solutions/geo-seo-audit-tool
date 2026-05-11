"use client";

import { SidebarContent } from "@/components/layout/SidebarContent";
import { useSidebarCollapsed } from "@/components/layout/SidebarCollapseContext";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

export function Sidebar({
  companies,
  account,
  quota,
}: {
  companies: Company[];
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
}) {
  const { collapsed, hydrated } = useSidebarCollapsed();

  return (
    <aside
      className={cn(
        "hidden h-full min-h-0 shrink-0 flex-col border-r border-border bg-muted/40 md:flex",
        hydrated && collapsed
          ? "md:w-16 md:min-w-[4rem] md:max-w-[4rem] px-2 py-4 pb-5"
          : "md:w-[15rem] md:min-w-[15rem] md:max-w-[15rem] p-4 pb-6",
        "transition-[padding] duration-200 motion-reduce:transition-none",
      )}
    >
      <SidebarContent
        companies={companies}
        account={account}
        quota={quota}
        variant="desktop"
      />
    </aside>
  );
}
