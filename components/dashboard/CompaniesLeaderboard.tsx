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

export interface CompanyLeaderRow {
  id: string;
  name: string;
  communityCount: number;
  lastScanAt: string | null;
  avgScore: number | null;
  avgSeo: number | null;
  avgGeo: number | null;
  /** Up to 8 recent overall scores for the sparkline (oldest → newest) */
  spark: number[];
}

function scoreFgClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function scoreBarColor(score: number | null): string {
  if (score === null) return "bg-muted-foreground/30";
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

function CompanyAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

function ScoreBar({
  score,
  label,
}: {
  score: number | null;
  label: string;
}) {
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
  if (mins < 60) return mins <= 1 ? "Just now" : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export function CompaniesLeaderboard({ rows }: { rows: CompanyLeaderRow[] }) {
  const ranked = [...rows].sort(
    (a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1),
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Companies leaderboard</CardTitle>
        <CardDescription>
          Ranked by average visibility score across all communities.
        </CardDescription>
      </CardHeader>

      {/* Header row */}
      <div className="grid items-center gap-4 border-t border-border bg-muted/40 px-6 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: "28px minmax(200px, 2fr) 90px 100px minmax(160px, 1fr) 72px 56px" }}
      >
        <span>#</span>
        <span>Company</span>
        <span>Communities</span>
        <span>Last scan</span>
        <span>SEO · GEO</span>
        <span className="text-right">Overall</span>
        <span />
      </div>

      {ranked.map((c, i) => (
        <Link
          key={c.id}
          href={`/companies/${c.id}`}
          className="group grid items-center gap-4 border-t border-border px-6 py-3 transition-colors hover:bg-accent"
          style={{ gridTemplateColumns: "28px minmax(200px, 2fr) 90px 100px minmax(160px, 1fr) 72px 56px" }}
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

          {/* Company */}
          <div className="flex min-w-0 items-center gap-3">
            <CompanyAvatar name={c.name} size={32} />
            <span className="truncate text-sm font-semibold">{c.name}</span>
          </div>

          {/* Communities */}
          <div className="text-sm tabular-nums">
            <span className="font-semibold">{c.communityCount}</span>
            <span className="ml-1 text-xs text-muted-foreground">sites</span>
          </div>

          {/* Last scan */}
          <span className="text-xs text-muted-foreground">
            {formatLastScan(c.lastScanAt)}
          </span>

          {/* Score bars */}
          <div className="flex flex-col gap-1.5">
            <ScoreBar score={c.avgSeo} label="SEO" />
            <ScoreBar score={c.avgGeo} label="GEO" />
          </div>

          {/* Sparkline + overall */}
          <div className="flex items-center justify-end gap-2">
            {c.spark.length >= 2 && (
              <Sparkline
                data={c.spark}
                color={sparkColor(c.avgScore)}
                width={48}
                height={20}
                fill
              />
            )}
          </div>

          {/* Score ring */}
          <div className="flex justify-end">
            <ScoreRing score={c.avgScore} size={40} strokeWidth={6} />
          </div>
        </Link>
      ))}

      {ranked.length === 0 && (
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No company score data yet. Run a visibility scan to see rankings.
        </CardContent>
      )}
    </Card>
  );
}
