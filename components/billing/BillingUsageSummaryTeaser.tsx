import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BillingUsageSnapshot } from "@/lib/billing/usage-snapshot";

export function BillingUsageSummaryTeaser({
  snapshot,
  usageHref = "/usage",
}: {
  snapshot: BillingUsageSnapshot;
  usageHref?: string;
}) {
  const { audits, community, organizationName } = snapshot;

  const auditsSummary =
    audits.kind === "unlimited"
      ? `Unlimited scan starts in ${organizationName}`
      : `${audits.used.toLocaleString()} of ${audits.limit.toLocaleString()} scan starts in ${organizationName} (${audits.periodLabel}) · ${audits.limit.toLocaleString()}/month on your account`;

  const communitySummary =
    community.kind === "unlimited"
      ? `${community.used.toLocaleString()} communit${community.used === 1 ? "y" : "ies"} in ${organizationName}`
      : `${community.used.toLocaleString()} of ${community.limit.toLocaleString()} communities in ${organizationName} · ${community.limit.toLocaleString()} allowed on your account`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Usage summary</CardTitle>
          <CardDescription>
            Totals for {organizationName}. Plan limits apply to your whole
            account — see the usage page for per-community breakdown.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link href={usageHref}>View usage</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>{auditsSummary}</p>
        <p className="text-muted-foreground">{communitySummary}</p>
      </CardContent>
    </Card>
  );
}
