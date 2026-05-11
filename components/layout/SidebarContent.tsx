"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { LayoutDashboard, PanelLeft, PanelLeftClose } from "lucide-react";

import { CompanySwitcher } from "@/components/companies/CompanySwitcher";
import { Brand } from "@/components/layout/Brand";
import { SidebarAccountSection } from "@/components/layout/SidebarAccountSection";
import { SidebarAdminLinks } from "@/components/layout/SidebarAdminLinks";
import { SidebarCompaniesList } from "@/components/layout/SidebarCompaniesList";
import { useSidebarCollapsed } from "@/components/layout/SidebarCollapseContext";
import { Button } from "@/components/ui/button";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

export function SidebarContent({
  companies,
  account,
  quota,
  onNavigate,
  variant = "desktop",
}: {
  companies: Company[];
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
}) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();
  const isMobile = variant === "mobile";
  const railCollapsed = !isMobile && collapsed;

  /** Scrollable cap: long community lists scroll; short lists do not push Admin to the bottom of the viewport. */
  const communitiesScrollClass =
    "min-h-0 shrink overflow-y-auto py-2 max-h-[min(24rem,calc(100vh-14rem))]";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className={cn("min-w-0", !railCollapsed && "flex-1")}>
            <Brand href="/dashboard" iconOnly={railCollapsed} size="sm" />
          </div>
          {!isMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={
                railCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              onClick={toggleCollapsed}
            >
              {railCollapsed ? (
                <PanelLeft className="h-4 w-4" aria-hidden />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              )}
            </Button>
          ) : null}
        </div>

        <CompanySwitcher
          companies={companies}
          collapsed={railCollapsed}
          onNavigate={onNavigate}
        />

        <nav aria-label="Primary">
          <Link
            href="/dashboard"
            onClick={onNavigate}
            title={railCollapsed ? "Dashboard" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              railCollapsed && "justify-center px-2",
              pathname === "/dashboard"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
            {!railCollapsed ? "Dashboard" : null}
          </Link>
        </nav>
      </div>

      <div
        className={cn(
          "flex flex-col",
          railCollapsed ? "shrink-0 py-2" : communitiesScrollClass,
        )}
      >
        <SidebarCompaniesList
          companies={companies}
          collapsed={railCollapsed}
          onNavigate={onNavigate}
        />
      </div>

      <div className="mt-3 shrink-0 space-y-0 border-t border-border pt-4">
        <Suspense
          fallback={
            <div
              className="h-[7.5rem] animate-pulse rounded-md bg-muted/40"
              aria-hidden
            />
          }
        >
          <SidebarAdminLinks
            collapsed={railCollapsed}
            onNavigate={onNavigate}
          />
        </Suspense>
        {account ? (
          <SidebarAccountSection
            quota={quota}
            email={account.email}
            fullName={account.fullName}
            avatarUrl={account.avatarUrl}
            collapsed={railCollapsed}
          />
        ) : null}
      </div>
    </div>
  );
}
