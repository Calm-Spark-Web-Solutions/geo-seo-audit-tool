"use client";

import Link from "next/link";
import { Gauge } from "lucide-react";

import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import { UserMenu } from "@/components/layout/UserMenu";
import { cn } from "@/lib/utils";

/** Hover / screen-reader context: matches getAuditQuotaSnapshot counting rules. */
const LIMITED_QUOTA_TITLE =
  "Manual scan quota counts audits that add at least one new tracked URL this month; pure rescans of URLs already on your roster are free. The period is UTC calendar month (or your Stripe trial window while trialing). Usage includes all organizations you belong to — limits are per signed-in account.";

export function SidebarAccountSection({
  quota,
  email,
  fullName,
  avatarUrl,
  collapsed,
  usageHref = "/usage",
}: {
  quota: AuditQuotaSnapshot;
  email: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  collapsed?: boolean;
  usageHref?: string;
}) {
  const effectiveQuota: AuditQuotaSnapshot =
    quota.kind === "limited" && quota.limit <= 0
      ? { kind: "unlimited" }
      : quota;

  const quotaLine =
    effectiveQuota.kind === "unlimited" ? (
      collapsed ? (
        <Link
          href={usageHref}
          className="flex justify-center rounded-md p-1 text-muted-foreground hover:bg-muted/80"
          title="Unlimited scans this month — view usage"
        >
          <Gauge className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <Link
          href={usageHref}
          className="block rounded-md px-1 py-0.5 text-xs leading-snug text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          title="View usage"
        >
          Unlimited scans this month
        </Link>
      )
    ) : (
      <Link
        href={usageHref}
        className={cn(
          "flex items-start gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2 transition-colors hover:bg-muted/50",
          collapsed && "justify-center border-0 bg-transparent p-1",
        )}
        title={
          collapsed
            ? `${effectiveQuota.remaining} of ${effectiveQuota.limit} scans left — view usage`
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
              Tap for full usage · all organizations on your account
            </p>
          </div>
        ) : null}
      </Link>
    );

  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-3 pt-1",
        collapsed && "items-center",
      )}
    >
      {quotaLine}
      <UserMenu
        email={email}
        fullName={fullName}
        avatarUrl={avatarUrl}
        placement="sidebar"
        compact={collapsed}
      />
    </div>
  );
}
