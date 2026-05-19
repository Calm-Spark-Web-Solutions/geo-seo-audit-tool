import {
  CRUX_FORM_FACTORS,
  CRUX_VITAL_BASE,
  cruxMetricCheckKey,
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

function VitalTile({
  checkKey,
  slot,
  checksByKey,
  compact = false,
}: {
  checkKey: string;
  slot: { id: CruxVitalId; abbrev: string; fullName: string };
  checksByKey: Map<string, AuditCheck>;
  compact?: boolean;
}) {
  const check = checksByKey.get(checkKey);
  const result: CheckResult | "none" = check?.result ?? "none";
  const value = resolveValue(check, slot.id);
  const copy = check ? getCruxBeginnerCopy(slot.id, check.result) : null;
  const status = statusWord(result);
  const summaryLabel = `${slot.abbrev} (${slot.fullName}): ${status.long}${
    value ? `, ${value.display}` : ""
  }`;

  return (
    <div
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
        <span className="text-xs uppercase tracking-wide">{slot.abbrev}</span>
      </div>

      <p
        className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          result === "pass" && "text-emerald-700 dark:text-emerald-400",
          result === "warn" && "text-amber-700 dark:text-amber-400",
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

      {!compact ? (
        <p className="text-xs font-medium leading-snug text-muted-foreground">
          {slot.fullName}
        </p>
      ) : null}

      {!compact && slot.id === "cls" ? (
        <p className="text-xs leading-snug text-muted-foreground">
          Lower is better — measures unwanted layout movement.
        </p>
      ) : null}

      {!compact && copy ? (
        <div className="w-full border-t border-border/70 pt-2 text-left">
          <p className="text-xs leading-snug text-muted-foreground">{copy.what}</p>
          <p className="mt-1 text-xs font-medium leading-snug text-foreground">
            {copy.targetLine}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-snug text-muted-foreground">
            {copy.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : !compact ? (
        <p className="text-xs text-muted-foreground">
          CrUX did not return this metric for your origin (traffic or coverage).
        </p>
      ) : null}
    </div>
  );
}

export function CruxVitalsOverview({
  checks,
  compact = false,
  collapseMobile = false,
}: {
  checks: AuditCheck[];
  compact?: boolean;
  collapseMobile?: boolean;
}) {
  const byKey = new Map(checks.map((c) => [c.key, c]));

  const hasNewKeys = CRUX_FORM_FACTORS.some((ff) =>
    CRUX_VITAL_BASE.some((v) => byKey.has(cruxMetricCheckKey(ff.id, v.id))),
  );

  if (!hasNewKeys) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-3">
        {CRUX_VITAL_SLOTS.map((slot) => (
          <VitalTile
            key={slot.checkKey}
            checkKey={slot.checkKey}
            slot={slot}
            checksByKey={byKey}
            compact={compact}
          />
        ))}
      </div>
    );
  }

  const desktop = CRUX_FORM_FACTORS.find((ff) => ff.primary) ?? CRUX_FORM_FACTORS[0]!;
  const mobile = CRUX_FORM_FACTORS.find((ff) => !ff.primary);

  const renderCohort = (ff: (typeof CRUX_FORM_FACTORS)[number]) => (
    <section
      key={ff.id}
      className={cn(
        ff.primary
          ? "rounded-lg border border-border bg-card/80 p-3 sm:p-4"
          : "rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4",
      )}
      aria-labelledby={`crux-cohort-${ff.id}`}
    >
      <h3
        id={`crux-cohort-${ff.id}`}
        className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-foreground"
      >
        {ff.label}
        {ff.primary ? (
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Primary
          </span>
        ) : null}
      </h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-2">
        {CRUX_VITAL_BASE.map((slot) => (
          <VitalTile
            key={cruxMetricCheckKey(ff.id, slot.id)}
            checkKey={cruxMetricCheckKey(ff.id, slot.id)}
            slot={slot}
            checksByKey={byKey}
            compact={compact}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {renderCohort(desktop)}
      {mobile && collapseMobile ? (
        <details className="rounded-lg border border-border/70 bg-muted/15">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
            {mobile.label} cohort
          </summary>
          <div className="px-3 pb-3">{renderCohort(mobile)}</div>
        </details>
      ) : mobile ? (
        renderCohort(mobile)
      ) : null}
    </div>
  );
}

/** True when we have at least one real-user histogram metric to summarize. */
export function hasCruxHistogramMetrics(checks: AuditCheck[]): boolean {
  const byKey = new Map(checks.map((c) => [c.key, c]));
  for (const ff of CRUX_FORM_FACTORS) {
    for (const v of CRUX_VITAL_BASE) {
      if (byKey.has(cruxMetricCheckKey(ff.id, v.id))) return true;
    }
  }
  return CRUX_VITAL_SLOTS.some((s) => byKey.has(s.checkKey));
}
