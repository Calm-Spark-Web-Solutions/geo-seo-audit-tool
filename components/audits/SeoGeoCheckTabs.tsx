"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { saveAuditPageScoreExclusions } from "@/app/(dashboard)/visibility-scans/[id]/pages/[pageId]/actions";
import { CheckList } from "@/components/audits/CheckList";
import {
  GEO_SECTION_DESCRIPTION,
  GEO_SECTION_TITLE,
  SEO_SECTION_DESCRIPTION,
  SEO_SECTION_TITLE,
} from "@/lib/audit/reader-copy";
import { cn } from "@/lib/utils";
import type { AuditCheck } from "@/types";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Tally = { pass: number; warn: number; fail: number };

type Pillar = "seo" | "geo";

function issues(t: Tally): number {
  return t.warn + t.fail;
}

function initialPillar(seoTally: Tally, geoTally: Tally): Pillar {
  if (issues(geoTally) > issues(seoTally)) return "geo";
  return "seo";
}

function mapChecksToExcluded(checks: AuditCheck[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const c of checks) {
    m[c.key] = c.excludeFromScore === true;
  }
  return m;
}

/** Stable line for comparing server rows vs draft for “dirty” detection. */
function exclusionLine(checks: AuditCheck[], draft: Record<string, boolean>): string {
  return checks
    .map((c) => `${c.key}:${draft[c.key] === true ? "1" : "0"}`)
    .sort()
    .join(",");
}

function TallyBadge({ tally }: { tally: Tally }) {
  const { pass, warn, fail } = tally;
  const accessibleLabel = `${pass} pass, ${warn} warning, ${fail} fail`;
  return (
    <span
      title="Pass / warn / fail counts"
      aria-label={accessibleLabel}
      className="ml-2 tabular-nums text-sm font-normal text-muted-foreground"
    >
      <span aria-hidden className="text-emerald-700 dark:text-emerald-400">{pass}</span>
      <span aria-hidden className="text-muted-foreground/80">/</span>
      <span aria-hidden className="text-amber-700 dark:text-amber-400">{warn}</span>
      <span aria-hidden className="text-muted-foreground/80">/</span>
      <span aria-hidden className="text-destructive">{fail}</span>
    </span>
  );
}

export function SeoGeoCheckTabs({
  seo,
  geo,
  seoTally,
  geoTally,
  auditId,
  pageId,
}: {
  seo: AuditCheck[];
  geo: AuditCheck[];
  seoTally: Tally;
  geoTally: Tally;
  /** When set with pageId, each check row can opt out of page SEO/GEO averages (saved in one batch). */
  auditId?: string;
  pageId?: string;
}) {
  const router = useRouter();
  const [pillar, setPillar] = useState<Pillar>(() =>
    initialPillar(seoTally, geoTally),
  );
  const [draftSeo, setDraftSeo] = useState(() => mapChecksToExcluded(seo));
  const [draftGeo, setDraftGeo] = useState(() => mapChecksToExcluded(geo));
  const [saving, setSaving] = useState(false);
  // Default to hiding passing rows on the checks view — most pages have many
  // passing rows that drown out the actionable findings.
  const [showPassing, setShowPassing] = useState(false);
  const seoTabRef = useRef<HTMLButtonElement | null>(null);
  const geoTabRef = useRef<HTMLButtonElement | null>(null);

  const focusTab = useCallback((next: Pillar) => {
    const el = next === "seo" ? seoTabRef.current : geoTabRef.current;
    el?.focus();
  }, []);

  const onTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, current: Pillar) => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown": {
          event.preventDefault();
          const next = current === "seo" ? "geo" : "seo";
          setPillar(next);
          focusTab(next);
          break;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          event.preventDefault();
          const next = current === "seo" ? "geo" : "seo";
          setPillar(next);
          focusTab(next);
          break;
        }
        case "Home": {
          event.preventDefault();
          setPillar("seo");
          focusTab("seo");
          break;
        }
        case "End": {
          event.preventDefault();
          setPillar("geo");
          focusTab("geo");
          break;
        }
      }
    },
    [focusTab],
  );

  useEffect(() => {
    // Resync local draft state when the server-provided checks change
    // (e.g. after a bulk save round-trip rehydrates the page). The new
    // react-hooks/set-state-in-effect rule flags this as a pure-derived
    // pattern, but here we genuinely own the draft state independently
    // of `seo`/`geo` between user edits, so the effect-driven resync is
    // intentional. Suppressing the rule for just this site keeps the
    // CI lint gate strict everywhere else.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraftSeo(mapChecksToExcluded(seo));
    setDraftGeo(mapChecksToExcluded(geo));
  }, [seo, geo]);

  const scoreEditing = Boolean(auditId && pageId);

  const isDirty = useMemo(() => {
    const serverSeo = mapChecksToExcluded(seo);
    const serverGeo = mapChecksToExcluded(geo);
    return (
      exclusionLine(seo, draftSeo) !== exclusionLine(seo, serverSeo) ||
      exclusionLine(geo, draftGeo) !== exclusionLine(geo, serverGeo)
    );
  }, [seo, geo, draftSeo, draftGeo]);

  const activeTitle =
    pillar === "seo" ? SEO_SECTION_TITLE : GEO_SECTION_TITLE;
  const activeDescription =
    pillar === "seo" ? SEO_SECTION_DESCRIPTION : GEO_SECTION_DESCRIPTION;
  const activeChecks = pillar === "seo" ? seo : geo;
  const activePassingCount = activeChecks.filter(
    (c) => c.result === "pass",
  ).length;

  async function onSaveScoreSelections() {
    if (!auditId || !pageId) return;
    setSaving(true);
    try {
      const r = await saveAuditPageScoreExclusions(auditId, pageId, {
        seo: draftSeo,
        geo: draftGeo,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Could not save");
      } else {
        toast.success("Score selections saved");
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="w-full flex-col gap-2 space-y-2">
        <div
          className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1"
          role="tablist"
          aria-label="Choose SEO or GEO check list"
        >
          <button
            ref={seoTabRef}
            type="button"
            role="tab"
            id="pillar-tab-seo"
            aria-controls="pillar-panel-checks"
            aria-selected={pillar === "seo"}
            tabIndex={pillar === "seo" ? 0 : -1}
            className={cn(
              "min-h-12 w-full rounded-md px-3 py-2.5 text-left text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              pillar === "seo"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setPillar("seo")}
            onKeyDown={(e) => onTabKeyDown(e, "seo")}
          >
            <span className="inline-flex flex-wrap items-baseline gap-x-1">
              <span>{SEO_SECTION_TITLE}</span>
              <TallyBadge tally={seoTally} />
            </span>
          </button>
          <button
            ref={geoTabRef}
            type="button"
            role="tab"
            id="pillar-tab-geo"
            aria-controls="pillar-panel-checks"
            aria-selected={pillar === "geo"}
            tabIndex={pillar === "geo" ? 0 : -1}
            className={cn(
              "min-h-12 w-full rounded-md px-3 py-2.5 text-left text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              pillar === "geo"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setPillar("geo")}
            onKeyDown={(e) => onTabKeyDown(e, "geo")}
          >
            <span className="inline-flex flex-wrap items-baseline gap-x-1">
              <span>{GEO_SECTION_TITLE}</span>
              <TallyBadge tally={geoTally} />
            </span>
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            Green
          </span>
          {" = pass · "}
          <span className="font-medium text-amber-700 dark:text-amber-400">
            Amber
          </span>
          {" = warning · "}
          <span className="font-medium text-destructive">Red</span>
          {" = fail. "}Numbers next to each tab are pass / warning / fail counts.
          {scoreEditing ? (
            <>
              {" "}
              Use <span className="font-medium text-foreground">Include in page average</span>{" "}
              to omit a check from this page&rsquo;s SEO or GEO average (findings stay visible).
              Switch tabs to edit both lists, then save once below.
            </>
          ) : (
            <>
              {" "}
              Switch tabs to compare SEO versus GEO — one list at a time keeps the checklist readable.
            </>
          )}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">{activeTitle}</CardTitle>
            <CardDescription>{activeDescription}</CardDescription>
          </div>
          {activePassingCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPassing((v) => !v)}
              className="shrink-0"
              aria-pressed={showPassing}
            >
              {showPassing
                ? `Hide ${activePassingCount} passing`
                : `Show ${activePassingCount} passing`}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent
          id="pillar-panel-checks"
          role="tabpanel"
          aria-labelledby={pillar === "seo" ? "pillar-tab-seo" : "pillar-tab-geo"}
          className="flex flex-col gap-4"
        >
          {activeChecks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No {pillar === "seo" ? "SEO" : "GEO"} checks recorded.
            </p>
          ) : (
            <CheckList
              title=""
              checks={activeChecks}
              explanationLayout="collapsible"
              auditId={auditId}
              pageId={pageId}
              hidePassing={!showPassing}
              scoreDraft={
                scoreEditing
                  ? {
                      excludedByKey: pillar === "seo" ? draftSeo : draftGeo,
                      disabled: saving,
                      onExcludedChange: (checkKey, excluded) => {
                        if (pillar === "seo") {
                          setDraftSeo((prev) => ({
                            ...prev,
                            [checkKey]: excluded,
                          }));
                        } else {
                          setDraftGeo((prev) => ({
                            ...prev,
                            [checkKey]: excluded,
                          }));
                        }
                      },
                    }
                  : undefined
              }
            />
          )}

          {scoreEditing ? (
            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {isDirty
                  ? "You have unsaved changes to which checks count toward this page average."
                  : "No pending changes."}
              </p>
              <Button
                type="button"
                size="sm"
                disabled={!isDirty || saving}
                onClick={() => void onSaveScoreSelections()}
              >
                {saving ? "Saving…" : "Save score selections"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
