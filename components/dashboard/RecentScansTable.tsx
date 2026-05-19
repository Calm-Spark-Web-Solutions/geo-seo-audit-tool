import { ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface RecentScanRow {
  id: string;
  communityName: string;
  companyName?: string | null;
  when: string;
  seo: number | null;
  geo: number | null;
  total: number | null;
  status: string;
}

function scoreFgClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function scoreDotColor(score: number | null): string {
  if (score === null) return "bg-muted-foreground/40";
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-destructive";
}

function ScoreChip({
  label,
  score,
  tinted = false,
}: {
  label: string;
  score: number | null;
  tinted?: boolean;
}) {
  const text = scoreFgClass(score);
  if (!tinted) {
    return (
      <span className="inline-flex items-baseline gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={`text-sm font-semibold tabular-nums ${text}`}>
          {score ?? "—"}
        </span>
      </span>
    );
  }
  const bg =
    score === null
      ? "bg-muted text-muted-foreground"
      : score >= 80
        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        : score >= 50
          ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${bg}`}
    >
      <span className="text-[10px] uppercase tracking-wide opacity-75">
        {label}
      </span>
      {score ?? "—"}
    </span>
  );
}

export function RecentScansTable({
  rows,
  showViewAll = true,
}: {
  rows: RecentScanRow[];
  showViewAll?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-end justify-between gap-4 pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-base">Recent visibility scans</CardTitle>
          <CardDescription>Latest runs across all communities.</CardDescription>
        </div>
        {showViewAll && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/companies" className="flex items-center gap-1">
              View all
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        )}
      </CardHeader>

      <div className="border-t border-border">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No scans yet. Run a visibility scan from a community page.
          </p>
        ) : (
          rows.map((s) => (
            <Link
              key={s.id}
              href={`/visibility-scans/${s.id}`}
              className="group flex items-center gap-4 border-t border-border px-6 py-3 transition-colors hover:bg-accent first:border-t-0"
            >
              {/* Status dot */}
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${scoreDotColor(s.total)}`}
                aria-hidden
              />

              {/* Community + company + timestamp */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {s.communityName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.companyName ? (
                    <span>
                      {s.companyName}
                      <span className="mx-1.5 text-border" aria-hidden>
                        ·
                      </span>
                    </span>
                  ) : null}
                  <span className="tabular-nums">
                    {new Date(s.when).toLocaleString()}
                  </span>
                </p>
              </div>

              {/* Score chips */}
              <div className="flex shrink-0 items-center gap-4">
                <ScoreChip label="SEO" score={s.seo} />
                <ScoreChip label="GEO" score={s.geo} />
                <ScoreChip label="Total" score={s.total} tinted />
              </div>

              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
