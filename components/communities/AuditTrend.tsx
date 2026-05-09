"use client";

import { TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Audit } from "@/types";

import type { TrendPoint } from "./AuditTrendChart";

// Recharts is ~150 kB gzipped — load it on demand so list/detail
// pages that never render the chart don't pay for it. `ssr: false`
// means the chart only mounts on the client, which is fine here:
// it's a non-critical visualization gated behind `points.length >= 2`.
const AuditTrendChart = dynamic(() => import("./AuditTrendChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

interface AuditTrendProps {
  audits: Audit[];
}

function buildPoints(audits: Audit[]): TrendPoint[] {
  return audits
    .filter((a) => a.status === "complete")
    .slice(0, 20)
    .map<TrendPoint>((a) => ({
      ts: new Date(a.created_at).getTime(),
      date: new Date(a.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      score: a.score,
      seo_score: a.seo_score,
      geo_score: a.geo_score,
    }))
    .sort((a, b) => a.ts - b.ts);
}

export function AuditTrend({ audits }: AuditTrendProps) {
  const points = buildPoints(audits);

  if (points.length === 0) {
    return null;
  }

  const subtitle = (() => {
    if (points.length < 2) return "Run another audit to see how scores trend.";
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];
    if (latest.score === null || prev.score === null) {
      return `Last ${points.length} completed audits`;
    }
    const delta = latest.score - prev.score;
    const sign = delta > 0 ? "+" : "";
    const deltaCopy =
      delta === 0
        ? "no change since previous"
        : `${sign}${delta} since previous`;
    return `Last ${points.length} completed audits · ${deltaCopy}`;
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" aria-hidden />
            Score over time
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
      </CardHeader>
      <div className="h-56 px-2 pb-3 sm:px-4">
        {points.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Not enough data yet — run another audit to plot a trend.
          </div>
        ) : (
          <AuditTrendChart points={points} />
        )}
      </div>
    </Card>
  );
}
