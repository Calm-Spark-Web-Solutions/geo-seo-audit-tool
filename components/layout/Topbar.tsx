import { Brand } from "@/components/layout/Brand";
import { MobileNavSheet } from "@/components/layout/MobileNavSheet";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import type { Company } from "@/types";

export function Topbar({
  companies,
  account,
  quota,
  activeOrganizationIdCookie,
}: {
  companies: Company[];
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
  activeOrganizationIdCookie: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 w-full shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavSheet
          companies={companies}
          account={account}
          quota={quota}
          activeOrganizationIdCookie={activeOrganizationIdCookie}
        />
        <div className="md:hidden">
          <Brand size="md" />
        </div>
      </div>
      {/* Account control lives in the desktop sidebar; keep here for small screens only. */}
      <div className="flex shrink-0 items-center gap-2 md:hidden">
        <ThemeToggle />
        <UserMenu
          email={account?.email ?? null}
          fullName={account?.fullName}
          avatarUrl={account?.avatarUrl}
        />
      </div>
    </header>
  );
}
