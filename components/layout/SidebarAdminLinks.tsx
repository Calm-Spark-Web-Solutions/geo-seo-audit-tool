"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CircleDollarSign,
  Gauge,
  LineChart,
  User,
  UsersRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type SettingsTab = "billing" | "team" | "organizations" | "profile";

const linkBase =
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors";

const items: Array<{
  tab: SettingsTab;
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  {
    tab: "profile",
    href: "/settings?tab=profile",
    label: "Profile",
    icon: User,
  },
  {
    tab: "billing",
    href: "/settings?tab=billing",
    label: "Billing",
    icon: CircleDollarSign,
  },
  {
    tab: "team",
    href: "/settings?tab=team",
    label: "Team Management",
    icon: UsersRound,
  },
  {
    tab: "organizations",
    href: "/settings?tab=organizations",
    label: "Organizations",
    icon: Building2,
  },
];

function activeTabFromSearchParams(tabParam: string | null): SettingsTab {
  if (tabParam === "profile") return "profile";
  if (tabParam === "team") return "team";
  if (tabParam === "organizations") return "organizations";
  return "billing";
}

export function SidebarAdminLinks({
  usageHref,
  googleHref,
  onNavigate,
  collapsed = false,
}: {
  usageHref: string;
  googleHref: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const usageActive = pathname === "/usage";
  const googleActive = pathname.startsWith("/integrations/google");
  // Read `?tab=` reactively so the sidebar highlight follows the in-page
  // Tabs strip. Previously this only re-ran on pathname change, leaving the
  // sidebar stuck on the first-loaded tab.
  const settingsActiveTab: SettingsTab | null =
    pathname === "/settings"
      ? activeTabFromSearchParams(searchParams.get("tab"))
      : null;

  return (
    <div>
      {!collapsed ? (
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
      ) : null}
      <nav
        className={cn(
          "flex flex-col gap-0.5",
          collapsed && "items-center",
        )}
        aria-label="Administration"
      >
        <Link
          href={usageHref}
          onClick={onNavigate}
          prefetch={true}
          title={collapsed ? "Usage" : undefined}
          className={cn(
            linkBase,
            collapsed && "justify-center px-2",
            usageActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
          )}
        >
          <Gauge className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed ? "Usage" : null}
        </Link>
        <Link
          href={googleHref}
          onClick={onNavigate}
          prefetch={true}
          title={
            collapsed ? "Google — Search Console & Analytics" : undefined
          }
          className={cn(
            linkBase,
            collapsed && "justify-center px-2",
            googleActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
          )}
        >
          <LineChart className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed ? "Google" : null}
        </Link>
        {items.map(({ tab, href, label, icon: Icon }) => {
          const isActive = pathname === "/settings" && settingsActiveTab === tab;
          return (
            <Link
              key={tab}
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={cn(
                linkBase,
                collapsed && "justify-center px-2",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed ? label : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
