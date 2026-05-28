import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BillingUsageSnapshot } from "@/lib/billing/usage-snapshot";

function formatCap(used: number, cap: number | null): string {
  if (cap === null) return `${used.toLocaleString()} / unlimited`;
  return `${used.toLocaleString()} / ${cap.toLocaleString()}`;
}

function Meter({
  used,
  cap,
  label,
}: {
  used: number;
  cap: number | null;
  label: string;
}) {
  const pct =
    cap === null || cap <= 0 ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const over = cap !== null && used >= cap;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{formatCap(used, cap)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={
            over
              ? "h-full bg-destructive"
              : "h-full bg-foreground/80"
          }
          style={{ width: `${cap === null ? 100 : pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function auditsSummaryLine(
  audits: BillingUsageSnapshot["audits"],
  organizationName: string,
): { primary: string; footnote: string | null } {
  if (audits.kind === "unlimited") {
    return {
      primary: "Unlimited visibility scans this month",
      footnote: null,
    };
  }
  return {
    primary: `Your plan allows ${audits.limit.toLocaleString()} scans/month for your whole account. ${organizationName} has used ${audits.used.toLocaleString()} this month.`,
    footnote: `Month: ${audits.periodLabel}`,
  };
}

function communitySummaryLine(
  community: BillingUsageSnapshot["community"],
  organizationName: string,
): { primary: string; footnote: string | null } {
  if (community.kind === "unlimited") {
    return {
      primary: `${community.used.toLocaleString()} communit${community.used === 1 ? "y" : "ies"} in ${organizationName}`,
      footnote: "Unlimited communities on your plan",
    };
  }
  return {
    primary: `${community.used.toLocaleString()} communit${community.used === 1 ? "y" : "ies"} in ${organizationName}`,
    footnote: `${community.limit.toLocaleString()} allowed on your account`,
  };
}

export function BillingUsageCard({ snapshot }: { snapshot: BillingUsageSnapshot }) {
  const { context, audits, community, perCommunity, organizationName } =
    snapshot;

  const auditsCopy = auditsSummaryLine(audits, organizationName);
  const communityCopy = communitySummaryLine(community, organizationName);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usage for {organizationName}</CardTitle>
        <CardDescription>
          {context.unlimited
            ? "Billing isn't enforced for this account."
            : "Rescanning a page you already track is always free. Only adding new pages counts against your monthly allowance."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Visibility scans
            </p>
            <p className="mt-1">{auditsCopy.primary}</p>
            {auditsCopy.footnote ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {auditsCopy.footnote}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Communities
            </p>
            <p className="mt-1">{communityCopy.primary}</p>
            {communityCopy.footnote ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {communityCopy.footnote}
              </p>
            ) : null}
          </div>
        </div>

        {perCommunity.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Per community
            </h3>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {perCommunity.map((c) => (
                <li key={c.communityId} className="flex flex-col gap-2 px-3 py-3">
                  <p className="font-medium">{c.communityName}</p>
                  <Meter
                    label="Tracked pages"
                    used={c.rosterUsed}
                    cap={c.rosterCap}
                  />
                  <Meter
                    label="New pages this month"
                    used={c.newAddedThisMonth}
                    cap={c.newMonthlyCap}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No communities in this organization yet. Add one from the company
            page to start tracking page roster usage.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
