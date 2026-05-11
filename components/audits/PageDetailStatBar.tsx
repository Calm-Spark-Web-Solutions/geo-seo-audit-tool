import { cn } from "@/lib/utils";

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

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function TallyPill({ label, tally }: { label: string; tally: Tally }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex items-baseline gap-1 tabular-nums">
        <span className="text-emerald-600 dark:text-emerald-400">{tally.pass}</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-amber-600 dark:text-amber-400">{tally.warn}</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-destructive">{tally.fail}</span>
      </span>
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Score
        </span>
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums leading-none",
            scoreTone(score),
          )}
        >
          {score ?? "—"}
        </span>
        {excluded ? (
          <span className="text-xs text-muted-foreground">
            (omitted from audit avg.)
          </span>
        ) : null}
      </div>
      <Separator />
      <TallyPill label="SEO" tally={seoTally} />
      <Separator />
      <TallyPill label="GEO" tally={geoTally} />
      <Separator />
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fixes
        </span>
        <span className="tabular-nums">{fixCount}</span>
      </div>
      <div className="ml-auto text-xs text-muted-foreground">
        Audited {auditedAt}
      </div>
      <p className="basis-full text-[11px] text-muted-foreground">
        SEO / GEO counts are{" "}
        <span className="text-emerald-600 dark:text-emerald-400">pass</span> /{" "}
        <span className="text-amber-600 dark:text-amber-400">warn</span> /{" "}
        <span className="text-destructive">fail</span>.
      </p>
    </div>
  );
}

function Separator() {
  return (
    <span
      aria-hidden
      className="hidden h-4 w-px self-center bg-border sm:inline-block"
    />
  );
}
