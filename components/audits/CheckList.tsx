"use client";

import { CircleAlert, CircleCheck, CircleX } from "lucide-react";

import { CollapsibleCheckRow } from "@/components/audits/CollapsibleCheckRow";
import type { AuditCheck, CheckResult } from "@/types";

function groupChecksByCategory(checks: AuditCheck[]): {
  category: string;
  items: AuditCheck[];
}[] {
  const order: string[] = [];
  const map = new Map<string, AuditCheck[]>();
  for (const c of checks) {
    const cat = c.category?.trim() || "General";
    if (!map.has(cat)) {
      map.set(cat, []);
      order.push(cat);
    }
    map.get(cat)!.push(c);
  }
  return order.map((category) => ({
    category,
    items: map.get(category) ?? [],
  }));
}

function Icon({ result }: { result: CheckResult }) {
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

export function CheckList({
  title,
  checks,
  explanationLayout = "inline",
  scoreDraft,
  auditId,
  pageId,
  hidePassing = false,
}: {
  title: string;
  checks: AuditCheck[];
  explanationLayout?: "inline" | "collapsible";
  /** Local-only toggles; parent saves with one action at the end of the section. */
  scoreDraft?: {
    excludedByKey: Record<string, boolean>;
    onExcludedChange: (checkKey: string, excluded: boolean) => void;
    disabled?: boolean;
  };
  /** When set, evidence "View full list" links route to the page inspector subroutes. */
  auditId?: string;
  pageId?: string;
  /** When true, rows with result === "pass" are filtered out before grouping. */
  hidePassing?: boolean;
}) {
  if (checks.length === 0) return null;
  const visibleChecks = hidePassing
    ? checks.filter((c) => c.result !== "pass")
    : checks;
  if (visibleChecks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No warnings or failures — every check passed in this category.
      </p>
    );
  }
  const grouped = groupChecksByCategory(visibleChecks);
  const showCategoryHeaders =
    grouped.length > 1 ||
    (grouped.length === 1 && grouped[0]?.category !== "General");
  const rowGap =
    explanationLayout === "collapsible" ? "gap-1.5" : "gap-2";

  return (
    <div className="flex flex-col gap-2">
      {title ? <h4 className="text-sm font-semibold">{title}</h4> : null}
      <div className="flex flex-col gap-4">
        {grouped.map(({ category, items }) => (
          <div key={category} className="flex flex-col gap-2">
            {showCategoryHeaders ? (
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h5>
            ) : null}
            <ul className={`flex flex-col ${rowGap}`}>
              {items.map((c) =>
                explanationLayout === "collapsible" ? (
                  <li key={c.key}>
                    <CollapsibleCheckRow
                      check={
                        scoreDraft
                          ? {
                              ...c,
                              excludeFromScore: scoreDraft.excludedByKey[c.key]
                                ? true
                                : undefined,
                            }
                          : c
                      }
                      auditId={auditId}
                      pageId={pageId}
                      scoreToggle={
                        scoreDraft
                          ? {
                              includeInScore:
                                scoreDraft.excludedByKey[c.key] !== true,
                              disabled: scoreDraft.disabled,
                              onIncludeChange: (include) => {
                                scoreDraft.onExcludedChange(c.key, !include);
                              },
                            }
                          : undefined
                      }
                    />
                  </li>
                ) : (
                  <li key={c.key} className="flex gap-2 text-sm">
                    <Icon result={c.result} />
                    <div>
                      <span className="font-medium">{c.label}</span>
                      <p className="whitespace-pre-line text-muted-foreground">{c.explanation}</p>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
