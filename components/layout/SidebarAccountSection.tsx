"use client";

import { Gauge } from "lucide-react";

import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import { UserMenu } from "@/components/layout/UserMenu";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

/** Hover / screen-reader context: matches getAuditQuotaSnapshot counting rules. */
const LIMITED_QUOTA_TITLE =
  "Each visibility scan you start counts once for the month (any outcome: pending, running, complete, failed, or cancelled). The period is the UTC calendar month shown. Usage includes all organizations you belong to, not only the organization selected in the nav — limits are per signed-in account.";

export function SidebarAccountSection({
  quota,
  email,
  fullName,
  avatarUrl,
  collapsed,
}: {
  quota: AuditQuotaSnapshot;
  email: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  collapsed?: boolean;
}) {
  const effectiveQuota: AuditQuotaSnapshot =
    quota.kind === "limited" && quota.limit <= 0
      ? { kind: "unlimited" }
      : quota;

  const quotaLine =
    effectiveQuota.kind === "unlimited" ? (
      <p
        className={cn(
          "text-xs leading-snug text-muted-foreground",
          collapsed && "sr-only",
        )}
        title={
          collapsed
            ? "Monthly visibility scans: unlimited (dev or billing bypass)"
            : undefined
        }
      >
        {collapsed ? null : "Unlimited scans this month"}
      </p>
    ) : (
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2",
          collapsed && "justify-center border-0 bg-transparent p-0",
        )}
        title={
          collapsed
            ? `${effectiveQuota.remaining} of ${effectiveQuota.limit} scans left — ${effectiveQuota.periodLabel}. ${LIMITED_QUOTA_TITLE}`
            : LIMITED_QUOTA_TITLE
        }
      >
        <Gauge
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground",
            collapsed && "m-0 h-4 w-4",
          )}
          aria-hidden
        />
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">
              {effectiveQuota.remaining} of {effectiveQuota.limit} scans left
            </p>
            <p className="text-[11px] text-muted-foreground">
              {effectiveQuota.periodLabel} · {effectiveQuota.used} used
            </p>
            <p className="text-[10px] leading-snug text-muted-foreground/90">
              Every started scan counts · all organizations on your account
            </p>
          </div>
        ) : null}
      </div>
    );

  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-3 pt-1",
        collapsed && "items-center",
      )}
    >
      {quotaLine}
      <div
        className={cn(
          "flex w-full items-center gap-2",
          collapsed ? "flex-col items-center" : "min-w-0 justify-end",
        )}
      >
        <ThemeToggle compact={collapsed} />
        <UserMenu
          email={email}
          fullName={fullName}
          avatarUrl={avatarUrl}
          placement="sidebar"
          compact={collapsed}
        />
      </div>
    </div>
  );
}
