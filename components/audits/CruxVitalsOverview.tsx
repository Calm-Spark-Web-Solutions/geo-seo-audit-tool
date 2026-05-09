import {
  CRUX_VITAL_SLOTS,
  getCruxBeginnerCopy,
  type CruxVitalId,
} from "@/lib/audit/crux-beginner-copy";
import { cn } from "@/lib/utils";
import type { AuditCheck, CheckResult } from "@/types";

function parseLegacyMs(explanation: string): number | null {
  const m = explanation.match(/≈\s*([\d,]+)\s*ms/i);
  if (!m) return null;
  return Number.parseInt(m[1]!.replace(/,/g, ""), 10);
}

function parseLegacyCls(explanation: string): number | null {
  const m = explanation.match(/≈\s*([\d.]+)\s*\(/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  return Number.isFinite(n) ? n : null;
}

function formatMsForDisplay(ms: number): string {
  if (ms >= 1000) {
    const s = ms / 1000;
    const digits = ms >= 10000 ? 0 : 1;
    return `~${s.toFixed(digits)} s`;
  }
  return `~${ms} ms`;
}

function toneClasses(result: CheckResult | "none"): string {
  if (result === "none") {
    return "border-muted-foreground/40 bg-muted/30 text-muted-foreground";
  }
  if (result === "pass") {
    return "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  }
  if (result === "warn") {
    return "border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-400";
  }
  return "border-destructive bg-destructive/10 text-destructive";
}

function statusWord(result: CheckResult | "none"): {
  short: string;
  long: string;
} {
  if (result === "pass") return { short: "Good", long: "Good" };
  if (result === "warn") return { short: "Fair", long: "Needs work" };
  if (result === "fail") return { short: "Poor", long: "Poor" };
  return { short: "—", long: "No data" };
}

function resolveValue(
  check: AuditCheck | undefined,
  id: CruxVitalId,
): { display: string; raw?: number } | null {
  if (!check) return null;

  if (check.cruxSample) {
    const { value, unit } = check.cruxSample;
    if (unit === "cls") {
      return { display: `~${value.toFixed(3)}`, raw: value };
    }
    return { display: formatMsForDisplay(value), raw: value };
  }

  const ex = check.explanation;
  if (id === "cls") {
    const v = parseLegacyCls(ex);
    if (v == null) return null;
    return { display: `~${v.toFixed(3)}`, raw: v };
  }
  const ms = parseLegacyMs(ex);
  if (ms == null) return null;
  return { display: formatMsForDisplay(ms), raw: ms };
}

export function CruxVitalsOverview({ checks }: { checks: AuditCheck[] }) {
  const byKey = new Map(checks.map((c) => [c.key, c]));

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-3">
      {CRUX_VITAL_SLOTS.map((slot) => {
        const check = byKey.get(slot.checkKey);
        const result: CheckResult | "none" = check?.result ?? "none";
        const value = resolveValue(check, slot.id);
        const copy = check
          ? getCruxBeginnerCopy(slot.id, check.result)
          : null;
        const status = statusWord(result);
        const summaryLabel = `${slot.abbrev} (${slot.fullName}): ${status.long}${
          value ? `, ${value.display}` : ""
        }`;

        return (
          <div
            key={slot.checkKey}
            className="flex flex-col items-center gap-2 rounded-lg border border-border/80 bg-card/50 px-2 py-3 text-center sm:px-3"
            aria-label={summaryLabel}
          >
            <div
              className={cn(
                "flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-[3px] text-xs font-bold leading-none",
                toneClasses(result),
              )}
              aria-hidden
            >
              <span className="text-xs uppercase tracking-wide">
                {slot.abbrev}
              </span>
            </div>

            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wide",
                result === "pass" &&
                  "text-emerald-700 dark:text-emerald-400",
                result === "warn" &&
                  "text-amber-700 dark:text-amber-400",
                result === "fail" && "text-destructive",
                result === "none" && "text-muted-foreground",
              )}
            >
              {status.long}
            </p>

            <div className="min-h-[1.75rem] w-full">
              {value ? (
                <p className="text-lg font-semibold tabular-nums leading-tight text-foreground">
                  {value.display}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">No data</p>
              )}
            </div>

            <p className="text-xs font-medium leading-snug text-muted-foreground">
              {slot.fullName}
            </p>

            {slot.id === "cls" ? (
              <p className="text-xs leading-snug text-muted-foreground">
                Lower is better — measures unwanted layout movement.
              </p>
            ) : null}

            {copy ? (
              <div className="w-full border-t border-border/70 pt-2 text-left">
                <p className="text-xs leading-snug text-muted-foreground">
                  {copy.what}
                </p>
                <p className="mt-1 text-xs font-medium leading-snug text-foreground">
                  {copy.targetLine}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-snug text-muted-foreground">
                  {copy.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                CrUX did not return this metric for your origin (traffic or
                coverage).
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** True when we have at least one real-user histogram metric to summarize. */
export function hasCruxHistogramMetrics(checks: AuditCheck[]): boolean {
  return CRUX_VITAL_SLOTS.some((s) =>
    checks.some((c) => c.key === s.checkKey),
  );
}
