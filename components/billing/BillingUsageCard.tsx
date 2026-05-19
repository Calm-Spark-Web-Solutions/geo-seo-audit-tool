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

export function BillingUsageCard({ snapshot }: { snapshot: BillingUsageSnapshot }) {
  const { context, audits, community, perCommunity } = snapshot;

  const auditsLine =
    audits.kind === "unlimited"
      ? "Unlimited manual audit runs this month"
      : `${audits.used.toLocaleString()} / ${audits.limit.toLocaleString()} manual audit runs (${audits.periodLabel})`;

  const communityLine =
    community.kind === "unlimited"
      ? `${community.used.toLocaleString()} communities · unlimited on your plan`
      : `${community.used.toLocaleString()} / ${community.limit.toLocaleString()} communities`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usage</CardTitle>
        <CardDescription>
          {context.unlimited
            ? "Billing enforcement is disabled in this environment."
            : "Rescans of already-tracked URLs are always free. New URLs count toward your monthly new-page allowance and each community's roster cap."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Manual audit runs
            </p>
            <p className="mt-1">{auditsLine}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Communities
            </p>
            <p className="mt-1">{communityLine}</p>
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
            Add a community to start tracking page roster usage.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
