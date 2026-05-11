"use client";

import { ChevronDown, CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { useState } from "react";

import { CheckEvidence } from "@/components/audits/CheckEvidence";
import { cn } from "@/lib/utils";
import type { AuditCheck, CheckResult } from "@/types";

function ResultIcon({ result }: { result: CheckResult }) {
  if (result === "pass") {
    return (
      <CircleCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-500"
        aria-hidden
      />
    );
  }
  if (result === "warn") {
    return (
      <CircleAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
        aria-hidden
      />
    );
  }
  return (
    <CircleX
      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
      aria-hidden
    />
  );
}

export function CollapsibleCheckRow({
  check: c,
  scoreToggle,
  auditId,
  pageId,
}: {
  check: AuditCheck;
  scoreToggle?: {
    /** When false, this row is omitted from the page SEO/GEO average. */
    includeInScore: boolean;
    disabled?: boolean;
    onIncludeChange: (include: boolean) => void;
  };
  /** When set, evidence "View full list" link points at the page's inspector subroute. */
  auditId?: string;
  pageId?: string;
}) {
  const [open, setOpen] = useState(c.result !== "pass");
  const excluded = c.excludeFromScore === true;

  return (
    <div className="flex items-start gap-3 rounded-md text-sm">
      <details
        className="group min-w-0 flex-1"
        open={open}
        onToggle={(ev) => setOpen(ev.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md hover:bg-muted/50 [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <ResultIcon result={c.result} />
          <span
            className={cn(
              "min-w-0 flex-1 leading-snug",
              excluded
                ? "font-medium text-muted-foreground line-through decoration-muted-foreground/50"
                : "font-medium",
            )}
          >
            {c.label}
            {excluded ? (
              <span className="ml-2 inline-block text-xs font-normal text-muted-foreground no-underline">
                (skipped for average)
              </span>
            ) : null}
          </span>
          <ChevronDown
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="ml-6 whitespace-pre-line border-l border-border/70 pb-1 pl-3 pt-1.5 text-sm leading-snug text-muted-foreground">
          {c.explanation}
          {c.evidence && c.evidence.items.length > 0 ? (
            <CheckEvidence
              evidence={c.evidence}
              auditId={auditId}
              pageId={pageId}
            />
          ) : null}
        </div>
      </details>
      {scoreToggle ? (
        <label
          className={cn(
            "flex shrink-0 cursor-pointer flex-col gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-2 sm:flex-row sm:items-center sm:gap-2",
            scoreToggle.disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-input accent-primary"
            checked={scoreToggle.includeInScore}
            disabled={scoreToggle.disabled}
            onChange={(e) => scoreToggle.onIncludeChange(e.target.checked)}
            aria-label="Include this check in the page SEO or GEO average"
          />
          <span className="max-w-[9rem] text-xs font-medium leading-snug text-muted-foreground">
            Include in page average
          </span>
        </label>
      ) : null}
    </div>
  );
}
