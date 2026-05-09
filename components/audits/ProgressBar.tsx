import { Loader2 } from "lucide-react";

export function ProgressBar({
  value,
  max,
  label,
  busy = false,
  indeterminate = false,
}: {
  value: number;
  max: number;
  label?: string;
  /** Show a spinner (e.g. while the audit is actively running). */
  busy?: boolean;
  /** Unknown total yet — animate a sliding bar instead of a fixed fill. */
  indeterminate?: boolean;
}) {
  const safeMax = max > 0 ? max : 0;
  const pct =
    safeMax === 0 ? 0 : Math.min(100, Math.max(0, (value / safeMax) * 100));

  const statusText =
    safeMax > 0
      ? `${label ?? "Progress"}: ${value} of ${safeMax}`
      : indeterminate
        ? `${label ?? "Progress"}: starting`
        : `${label ?? "Progress"}: ${value}`;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="flex min-w-0 items-center gap-2">
          {busy ? (
            <Loader2
              className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
          <span aria-hidden>{label ?? "Progress"}</span>
        </span>
        <span className="tabular-nums shrink-0" aria-hidden>
          {safeMax > 0 ? `${value} / ${safeMax}` : indeterminate ? "…" : `${value}`}
        </span>
        <span className="sr-only">{statusText}</span>
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-busy={indeterminate ? true : undefined}
        aria-label={label}
        {...(indeterminate
          ? {}
          : {
              "aria-valuenow": value,
              "aria-valuemin": 0,
              "aria-valuemax": safeMax || undefined,
            })}
      >
        {indeterminate ? (
          <div className="audit-progress-strip absolute inset-y-0 w-[34%] rounded-full bg-foreground/75" />
        ) : (
          <div
            className="h-full rounded-full bg-foreground/80 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
