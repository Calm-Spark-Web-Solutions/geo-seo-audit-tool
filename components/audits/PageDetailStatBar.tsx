import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreRing } from "@/components/audits/ScoreRing";

interface Tally {
  pass: number;
  warn: number;
  fail: number;
}

interface PageDetailStatBarProps {
  score: number | null;
  excluded?: boolean;
  seoTally: Tally;
  geoTally: Tally;
  fixCount: number;
  auditedAt: string;
}

function labelColorClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function StatusChip({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        Not scored
      </span>
    );
  }
  if (score >= 80) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        Good
      </span>
    );
  }
  if (score >= 60) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        Needs work
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
      Critical
    </span>
  );
}

function PillarBar({ label, tally }: { label: string; tally: Tally }) {
  const total = tally.pass + tally.warn + tally.fail;
  const pw = total > 0 ? (tally.pass / total) * 100 : 0;
  const ww = total > 0 ? (tally.warn / total) * 100 : 0;
  const fw = total > 0 ? (tally.fail / total) * 100 : 0;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">
            {tally.pass}
          </span>
          <span className="text-muted-foreground/50"> / </span>
          <span className="text-amber-600 dark:text-amber-400">
            {tally.warn}
          </span>
          <span className="text-muted-foreground/50"> / </span>
          <span className="text-destructive">{tally.fail}</span>
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted/40">
        {pw > 0 && (
          <div className="bg-emerald-500" style={{ width: `${pw}%` }} />
        )}
        {ww > 0 && (
          <div className="bg-amber-400" style={{ width: `${ww}%` }} />
        )}
        {fw > 0 && (
          <div className="bg-destructive" style={{ width: `${fw}%` }} />
        )}
      </div>
    </div>
  );
}

export function PageDetailStatBar({
  score,
  excluded,
  seoTally,
  geoTally,
  fixCount,
  auditedAt,
}: PageDetailStatBarProps) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Score ring */}
          <ScoreRing score={score} />

          {/* Score label + pillar bars */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="sr-only">Overall score:</span>
              <span
                className={cn(
                  "text-xl font-bold tabular-nums",
                  labelColorClass(score),
                )}
              >
                {score ?? "—"}
              </span>
              <StatusChip score={score} />
              {excluded && (
                <span className="text-xs text-muted-foreground">
                  (excluded from audit avg.)
                </span>
              )}
            </div>
            <PillarBar label="SEO" tally={seoTally} />
            <PillarBar label="GEO" tally={geoTally} />
            <p className="text-[11px] text-muted-foreground">
              Counts are{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                pass
              </span>{" "}
              /{" "}
              <span className="text-amber-600 dark:text-amber-400">warn</span>{" "}
              / <span className="text-destructive">fail</span>.
            </p>
          </div>

          {/* Fix count + date */}
          <div className="flex flex-row items-center gap-5 border-t border-border pt-3 text-sm sm:flex-col sm:items-end sm:border-0 sm:pt-0 sm:text-right">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{fixCount}</p>
              <p className="text-xs text-muted-foreground">Recommendations</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Audited {auditedAt}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
