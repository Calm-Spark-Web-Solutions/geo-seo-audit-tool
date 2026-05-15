import type { ReactNode } from "react";
import Link from "next/link";

import { Sparkline } from "@/components/dashboard/Sparkline";
import { ScoreRing } from "@/components/audits/ScoreRing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface CommunityLeaderRow {
  /** community id — links to /communities/:id */
  communityId: string;
  /** most recent scan id — links to /visibility-scans/:id */
  latestScanId: string | null;
  name: string;
  companyName?: string | null;
  lastScanAt: string | null;
  latestScore: number | null;
  latestSeo: number | null;
  latestGeo: number | null;
  /** Up to 8 recent overall scores, oldest → newest */
  spark: number[];
}

function scoreFgClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function scoreBarColor(score: number | null): string {
  if (score === null) return "bg-muted-foreground/25";
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-destructive";
}

function sparkColor(score: number | null): string {
  if (score === null) return "#94a3b8";
  if (score >= 80) return "#059669";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function CommunityAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
      {initials}
    </span>
  );
}

function ScoreBar({ score, label }: { score: number | null; label: string }) {
  const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`w-7 text-right text-xs font-semibold tabular-nums ${scoreFgClass(score)}`}
      >
        {score ?? "—"}
      </span>
    </div>
  );
}

function formatLastScan(at: string | null): string {
  if (!at) return "Never";
  const diff = Date.now() - new Date(at).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export function CommunitiesLeaderboard({
  rows,
  showCompany = false,
  footer,
}: {
  rows: CommunityLeaderRow[];
  /** Show the company column — true when multiple companies are present */
  showCompany?: boolean;
  /** Optional content rendered below the last row (e.g. "View all orgs" link) */
  footer?: ReactNode;
}) {
  // Sort by latest score descending; unsorted (no scan) goes to bottom
  const ranked = [...rows].sort(
    (a, b) => (b.latestScore ?? -1) - (a.latestScore ?? -1),
  );

  // Grid cols differ based on whether we show the company column
  const gridCols = showCompany
    ? "28px minmax(160px,2fr) minmax(120px,1fr) 100px minmax(160px,1fr) 72px 48px"
    : "28px minmax(200px,2fr) 100px minmax(160px,1fr) 72px 48px";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Communities leaderboard</CardTitle>
        <CardDescription>
          Ranked by most recent visibility score.
        </CardDescription>
      </CardHeader>

      {/* Header row */}
      <div
        className="grid items-center gap-4 border-t border-border bg-muted/40 px-6 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: gridCols }}
      >
        <span>#</span>
        <span>Community</span>
        {showCompany && <span>Company</span>}
        <span>Last scan</span>
        <span>SEO · GEO</span>
        <span className="text-right">Overall</span>
        <span />
      </div>

      {ranked.map((row, i) => {
        const href = row.latestScanId
          ? `/visibility-scans/${row.latestScanId}`
          : `/communities/${row.communityId}`;

        return (
          <Link
            key={row.communityId}
            href={href}
            className="group grid items-center gap-4 border-t border-border px-6 py-3 transition-colors hover:bg-accent"
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Rank */}
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                i === 0
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>

            {/* Community name */}
            <div className="flex min-w-0 items-center gap-3">
              <CommunityAvatar name={row.name} />
              <span className="truncate text-sm font-semibold">{row.name}</span>
            </div>

            {/* Company (multi-org only) */}
            {showCompany && (
              <span className="truncate text-xs text-muted-foreground">
                {row.companyName ?? "—"}
              </span>
            )}

            {/* Last scan */}
            <span className="text-xs text-muted-foreground">
              {formatLastScan(row.lastScanAt)}
            </span>

            {/* Score bars */}
            <div className="flex flex-col gap-1.5">
              <ScoreBar score={row.latestSeo} label="SEO" />
              <ScoreBar score={row.latestGeo} label="GEO" />
            </div>

            {/* Sparkline */}
            <div className="flex items-center justify-end">
              {row.spark.length >= 2 && (
                <Sparkline
                  data={row.spark}
                  color={sparkColor(row.latestScore)}
                  width={48}
                  height={20}
                  fill
                />
              )}
            </div>

            {/* Score ring */}
            <div className="flex justify-end">
              <ScoreRing score={row.latestScore} size={40} strokeWidth={6} />
            </div>
          </Link>
        );
      })}

      {ranked.length === 0 && (
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No communities yet. Add one to start running visibility scans.
        </CardContent>
      )}

      {footer}
    </Card>
  );
}
