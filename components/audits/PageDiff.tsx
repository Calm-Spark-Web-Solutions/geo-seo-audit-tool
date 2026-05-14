"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Minus, Plus } from "lucide-react";

import { diffPage, type CheckDelta } from "@/lib/audit/diff";
import { cn } from "@/lib/utils";
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
  regressed: "border-destructive/40 bg-destructive/10 text-destructive",
  lateral:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  added: "border-border bg-muted text-foreground",
  removed: "border-border bg-muted text-muted-foreground",
  score_up:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  score_down: "border-destructive/40 bg-destructive/10 text-destructive",
};

const COLLAPSE_AT = 5;

export function PageDiff({ current, prior }: PageDiffProps) {
  const [expanded, setExpanded] = useState(false);

  if (!prior) return null;
  const deltas = diffPage(current, prior);
  if (deltas.length === 0) return null;

  const needsCollapse = deltas.length > COLLAPSE_AT;
  const visible =
    needsCollapse && !expanded ? deltas.slice(0, COLLAPSE_AT) : deltas;
  const hiddenCount = deltas.length - COLLAPSE_AT;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Changes since previous audit
        </h4>
        {needsCollapse && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : `${deltas.length} total`}
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {visible.map((d) => (
          <li key={`${d.kind}-${d.key}`}>
            <DeltaBadge delta={d} />
          </li>
        ))}
        {needsCollapse && !expanded && hiddenCount > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              +{hiddenCount} more
            </button>
          </li>
        )}
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
