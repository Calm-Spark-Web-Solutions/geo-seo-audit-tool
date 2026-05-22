import { Brand } from "@/components/layout/Brand";
import { CompanySwitcher } from "@/components/companies/CompanySwitcher";
import { MobileNavSheet } from "@/components/layout/MobileNavSheet";
import { UserMenu } from "@/components/layout/UserMenu";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import type { SidebarNavHrefs } from "@/lib/layout/sidebar-nav-hrefs";
import type { Company } from "@/types";

export function Topbar({
  companies,
  account,
  quota,
  activeOrganizationIdCookie,
  navHrefs,
}: {
  companies: Company[];
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
  activeOrganizationIdCookie: string | null;
  navHrefs: SidebarNavHrefs;
}) {
  const hasMultipleOrgs = companies.length > 1;
  return (
    <header className="sticky top-0 z-20 flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-background/80 px-3 backdrop-blur md:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavSheet
          companies={companies}
          account={account}
          quota={quota}
          activeOrganizationIdCookie={activeOrganizationIdCookie}
          navHrefs={navHrefs}
        />
        <Brand size="md" />
      </div>

      {hasMultipleOrgs ? (
        <div className="min-w-0 flex-1 max-w-[180px]">
          <CompanySwitcher
            companies={companies}
            collapsed
            activeOrganizationIdCookie={activeOrganizationIdCookie}
          />
        </div>
      ) : null}

      <div className="flex shrink-0 items-center">
        <UserMenu
          email={account?.email ?? null}
          fullName={account?.fullName}
          avatarUrl={account?.avatarUrl}
        />
      </div>
    </header>
  );
}
