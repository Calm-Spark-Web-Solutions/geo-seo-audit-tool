import { ArrowDownRight, ArrowRight, ArrowUpRight, Plus, Minus } from "lucide-react";

import { diffPage, type CheckDelta } from "@/lib/audit/diff";
import type { AuditCheck } from "@/types";

interface PageDiffProps {
  current: {
    seo_results: AuditCheck[] | null;
    geo_results: AuditCheck[] | null;
  };
  prior?: {
    seo_results: AuditCheck[] | null;
    geo_results: AuditCheck[] | null;
  };
}

const TONE: Record<string, string> = {
  improved:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  regressed:
    "border-destructive/40 bg-destructive/10 text-destructive",
  lateral: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  added: "border-border bg-muted text-foreground",
  removed: "border-border bg-muted text-muted-foreground",
  score_up:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  score_down:
    "border-destructive/40 bg-destructive/10 text-destructive",
};

export function PageDiff({ current, prior }: PageDiffProps) {
  if (!prior) return null;
  const deltas = diffPage(current, prior);
  if (deltas.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Changes since previous audit
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {deltas.map((d) => (
          <li key={`${d.kind}-${d.key}`}>
            <DeltaBadge delta={d} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: CheckDelta }) {
  if (delta.kind === "result_change") {
    const tone = TONE[delta.direction];
    const Icon =
      delta.direction === "improved"
        ? ArrowUpRight
        : delta.direction === "regressed"
          ? ArrowDownRight
          : ArrowRight;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tone}`}
        title={`${delta.label}: ${delta.from} → ${delta.to}`}
      >
        <Icon className="h-3 w-3" aria-hidden />
        <span className="font-medium">{delta.label}</span>
        <span className="tabular-nums opacity-70">
          {delta.from} → {delta.to}
        </span>
      </span>
    );
  }
  if (delta.kind === "added") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${TONE.added}`}
        title={`${delta.label} (new check this run)`}
      >
        <Plus className="h-3 w-3" aria-hidden />
        <span className="font-medium">{delta.label}</span>
        <span className="opacity-70">new</span>
      </span>
    );
  }
  if (delta.kind === "removed") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${TONE.removed}`}
        title={`${delta.label} no longer evaluated`}
      >
        <Minus className="h-3 w-3" aria-hidden />
        <span className="font-medium">{delta.label}</span>
        <span className="opacity-70">retired</span>
      </span>
    );
  }
  // score_change
  const positive = delta.delta > 0;
  const tone = positive ? TONE.score_up : TONE.score_down;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const sign = positive ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tone}`}
      title={`${delta.label}: ${delta.from} → ${delta.to}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="font-medium">{delta.label}</span>
      <span className="tabular-nums opacity-70">
        {sign}
        {delta.delta}
      </span>
    </span>
  );
}
