import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  CommunityGoogleMetricsSnapshot,
  GoogleMetricsJson,
} from "@/types";

export type GoogleMetricsMapped = {
  gsc: boolean;
  ga4: boolean;
};

export type GoogleMetricsInput =
  | GoogleMetricsJson
  | CommunityGoogleMetricsSnapshot
  | null;

function metricsFromInput(
  metrics: GoogleMetricsInput,
): GoogleMetricsJson | null {
  if (!metrics) return null;
  return {
    gsc_clicks_28d: metrics.gsc_clicks_28d ?? 0,
    gsc_impressions_28d: metrics.gsc_impressions_28d ?? 0,
    ga4_sessions_28d: metrics.ga4_sessions_28d ?? 0,
    ga4_active_users_28d: metrics.ga4_active_users_28d ?? 0,
  };
}

function asOfFromInput(
  metrics: GoogleMetricsInput,
  asOf?: string,
): string | null {
  if (asOf) return asOf;
  if (metrics && "snapshot_date" in metrics) {
    return metrics.snapshot_date;
  }
  return null;
}

interface Props {
  metrics: GoogleMetricsInput;
  mapped?: GoogleMetricsMapped;
  asOf?: string;
  /** Scan detail: no refresh CTA */
  variant?: "community" | "audit";
}

export function GoogleMetricsCard({
  metrics,
  mapped,
  asOf,
  variant = "community",
}: Props) {
  const showGsc = mapped?.gsc ?? Boolean(metrics);
  const showGa4 = mapped?.ga4 ?? Boolean(metrics);
  const shouldRender =
    showGsc || showGa4 || metrics != null;
  if (!shouldRender) return null;

  const values = metricsFromInput(metrics);
  const asOfDate = asOfFromInput(metrics, asOf);
  const hasSnapshot = values != null;

  const title =
    variant === "audit"
      ? "Google traffic (last 28 days)"
      : "Last 28 days (Google)";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {asOfDate ? (
            <>
              Snapshot from{" "}
              {new Date(asOfDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </>
          ) : hasSnapshot ? (
            "Totals from your latest visibility scan"
          ) : (
            "No snapshot yet — refresh below or run a visibility scan."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showGsc ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Google Search Console</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="Clicks" value={values?.gsc_clicks_28d} />
              <Metric label="Impressions" value={values?.gsc_impressions_28d} />
            </dl>
          </section>
        ) : null}
        {showGa4 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Google Analytics</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="Sessions" value={values?.ga4_sessions_28d} />
              <Metric
                label="Active users"
                value={values?.ga4_active_users_28d}
              />
            </dl>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">
        {value != null ? value.toLocaleString() : "—"}
      </dd>
    </div>
  );
}
