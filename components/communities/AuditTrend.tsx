"use client";

import { TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Audit, CommunityGoogleMetricsSnapshot } from "@/types";

import type { TrendPoint } from "./AuditTrendChart";

const AuditTrendChart = dynamic(() => import("./AuditTrendChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-md" />,
});

interface AuditTrendProps {
  audits: Audit[];
  metricsSnapshots?: CommunityGoogleMetricsSnapshot[];
}

function buildScorePoints(audits: Audit[]): TrendPoint[] {
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
      gsc_clicks: null,
      ga4_sessions: null,
    }))
    .sort((a, b) => a.ts - b.ts);
}

function mergeTrafficIntoPoints(
  scorePoints: TrendPoint[],
  snapshots: CommunityGoogleMetricsSnapshot[],
): TrendPoint[] {
  if (snapshots.length === 0) return scorePoints;

  const byDate = new Map(
    snapshots.map((s) => [
      s.snapshot_date,
      {
        gsc: s.gsc_clicks_28d ?? null,
        ga4: s.ga4_sessions_28d ?? null,
        ts: new Date(s.snapshot_date).getTime(),
      },
    ]),
  );

  const merged = new Map<number, TrendPoint>();
  for (const p of scorePoints) {
    merged.set(p.ts, { ...p });
  }

  for (const snap of snapshots) {
    const row = byDate.get(snap.snapshot_date);
    if (!row) continue;
    const existing = [...merged.values()].find(
      (p) => p.date === new Date(snap.snapshot_date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
    if (existing) {
      existing.gsc_clicks = row.gsc;
      existing.ga4_sessions = row.ga4;
    } else {
      merged.set(row.ts, {
        ts: row.ts,
        date: new Date(snap.snapshot_date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        score: null,
        seo_score: null,
        geo_score: null,
        gsc_clicks: row.gsc,
        ga4_sessions: row.ga4,
      });
    }
  }

  return [...merged.values()].sort((a, b) => a.ts - b.ts);
}

export function AuditTrend({ audits, metricsSnapshots = [] }: AuditTrendProps) {
  const [showTraffic, setShowTraffic] = useState(false);
  const hasTraffic = metricsSnapshots.length > 0;

  const points = useMemo(() => {
    const scores = buildScorePoints(audits);
    return showTraffic && hasTraffic
      ? mergeTrafficIntoPoints(scores, metricsSnapshots)
      : scores;
  }, [audits, metricsSnapshots, showTraffic, hasTraffic]);

  if (points.length === 0) {
    return null;
  }

  const subtitle = (() => {
    if (points.length < 2) return "Run another audit to see how scores trend.";
    const latest = points[points.length - 1];
    const prev = points[points.length - 2];
    if (latest.score === null || prev.score === null) {
      return `Last ${points.length} data points`;
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
        {hasTraffic ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowTraffic((v) => !v)}
          >
            {showTraffic ? "Hide traffic" : "Show traffic"}
          </Button>
        ) : null}
      </CardHeader>
      <div className="min-h-56 w-full min-w-0 px-2 pb-3 sm:px-4">
        {points.length < 2 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            Not enough data yet — run another audit to plot a trend.
          </div>
        ) : (
          <AuditTrendChart points={points} showTraffic={showTraffic && hasTraffic} />
        )}
      </div>
    </Card>
  );
}
