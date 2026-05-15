"use client";

import { FileSearch } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CruxVitalsOverview,
  hasCruxHistogramMetrics,
} from "@/components/audits/CruxVitalsOverview";
import { CheckList } from "@/components/audits/CheckList";
import { AuditPageRow } from "@/components/audits/AuditPageRow";
import { AuditScoreCard } from "@/components/audits/AuditScoreCard";
import type { RemoveAuditPageSuccess } from "@/app/(dashboard)/visibility-scans/[id]/pages/[pageId]/actions";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Audit, AuditCheck, AuditPage, AuditQueueDiagnostics } from "@/types";
import { categoryLabelSortKey } from "@/lib/crawler/shard-labels";

export type PriorPageSnapshot = {
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
};

const FAILURE_TOAST_THRESHOLD = 3;

function partitionAuditPagesByCategory(
  pageList: AuditPage[],
): { label: string; items: AuditPage[] }[] {
  const map = new Map<string, AuditPage[]>();
  for (const p of pageList) {
    const label = p.sitemap_category_label?.trim() || "Uncategorized";
    const arr = map.get(label) ?? [];
    arr.push(p);
    map.set(label, arr);
  }
  const entries = [...map.entries()].sort(([a], [b]) => {
    const ka = categoryLabelSortKey(a);
    const kb = categoryLabelSortKey(b);
    if (ka !== kb) return ka - kb;
    return a.localeCompare(b);
  });
  return entries.map(([label, items]) => ({
    label,
    items: [...items].sort((x, y) => {
      const sx = x.score ?? -1;
      const sy = y.score ?? -1;
      return sy - sx;
    }),
  }));
}

// Adaptive polling cadence. Most audits finish well within the first
// minute, so the dense 2 s tempo is what the user actually sees. After
// that we step down to 5 s (30 s in) and 10 s (2 min in) to keep the
// snapshot egress + function-invocation cost bounded for runs that drag.
// Returning to the tab resets the timer back to 2 s — see the
// visibilitychange handler below.
const POLL_FAST_MS = 2000;
const POLL_MEDIUM_MS = 5000;
const POLL_SLOW_MS = 10_000;
const POLL_MEDIUM_AFTER_MS = 30_000;
const POLL_SLOW_AFTER_MS = 120_000;

function pollIntervalForAge(ageMs: number): number {
  if (ageMs >= POLL_SLOW_AFTER_MS) return POLL_SLOW_MS;
  if (ageMs >= POLL_MEDIUM_AFTER_MS) return POLL_MEDIUM_MS;
  return POLL_FAST_MS;
}

function isTerminal(status: Audit["status"]): boolean {
  return (
    status === "complete" || status === "failed" || status === "cancelled"
  );
}

export function AuditDetailLive({
  initialAudit,
  initialPages,
  priorByUrl,
  initialQueue,
}: {
  initialAudit: Audit;
  initialPages: AuditPage[];
  priorByUrl?: Record<string, PriorPageSnapshot>;
  initialQueue?: AuditQueueDiagnostics | null;
}) {
  // Note: the parent passes `key={typedAudit.id}`, so this component remounts
  // when the audit id changes. That means useState/useRef seeds always reflect
  // the new audit and polling restarts cleanly — no manual reset effect needed.
  const [audit, setAudit] = useState<Audit>(initialAudit);
  const [pages, setPages] = useState<AuditPage[]>(initialPages);
  const [queue, setQueue] = useState<AuditQueueDiagnostics | null>(
    initialQueue ?? null,
  );
  const pageGroups = useMemo(
    () => partitionAuditPagesByCategory(pages),
    [pages],
  );
  const stoppedRef = useRef(isTerminal(initialAudit.status));
  const searchParams = useSearchParams();
  const startedFlag = searchParams.get("started");
  const resumedFlag = searchParams.get("resumed");

  useEffect(() => {
    // Stable per-audit toast id so sonner dedupes if the effect runs more than
    // once on mount (React Strict Mode in dev double-invokes effects; without
    // an id we'd render two identical "Audit started" toasts).
    if (startedFlag === "1") {
      toast.success("Audit started", {
        id: `audit-started:${initialAudit.id}`,
        description:
          "We're discovering URLs and scoring pages — this updates live.",
      });
    } else if (resumedFlag === "1") {
      toast.info("Resuming the in-flight audit for this community.", {
        id: `audit-resumed:${initialAudit.id}`,
      });
    }
    // Only run on first paint per audit detail mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stoppedRef.current) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const inFlightRef = { current: false };
    const failuresRef = { current: 0 };
    let toastedFailure = false;
    // Reset by visibilitychange so coming back to the tab restarts the
    // dense polling tempo even on long-running audits.
    let pollStartedAt = Date.now();

    const scheduleNext = (delay?: number) => {
      if (cancelled || stoppedRef.current) return;
      const next = delay ?? pollIntervalForAge(Date.now() - pollStartedAt);
      timeoutId = setTimeout(tick, next);
    };

    const fetchFullOnce = async () => {
      // One final rich payload so the per-page summary lines (pass / warn /
      // fail / fixes) populate after a run finishes. Failures here are
      // non-fatal: the user can refresh the page if they really want the
      // full breakdown.
      try {
        const res = await fetch(`/api/visibility-scans/${initialAudit.id}/snapshot`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          audit: Audit;
          pages: AuditPage[];
          queue?: AuditQueueDiagnostics | null;
        };
        if (cancelled) return;
        setAudit((prev) => ({ ...prev, ...json.audit }));
        setPages(json.pages);
        if ("queue" in json) setQueue(json.queue ?? null);
      } catch {
        // Silent — the live polling loop is already done; the user has
        // a stable terminal screen even without the rich summaries.
      }
    };

    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      if (typeof document !== "undefined" && document.hidden) {
        // Pause while hidden; visibilitychange below will resume.
        return;
      }
      if (inFlightRef.current) {
        scheduleNext();
        return;
      }
      inFlightRef.current = true;
      try {
        const res = await fetch(
          `/api/visibility-scans/${initialAudit.id}/snapshot?mode=light`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          failuresRef.current += 1;
          if (
            failuresRef.current >= FAILURE_TOAST_THRESHOLD &&
            !toastedFailure
          ) {
            toastedFailure = true;
            toast.error("Lost connection to the scan feed; retrying…");
          }
          return;
        }
        const json = (await res.json()) as {
          audit: Audit;
          pages: AuditPage[];
          queue?: AuditQueueDiagnostics | null;
        };
        if (cancelled) return;
        failuresRef.current = 0;
        toastedFailure = false;
        // Merge so heavier audit fields (site_wide_checks, crux_field_checks)
        // hydrated from the initial server render survive light polls that
        // don't include them.
        setAudit((prev) => ({ ...prev, ...json.audit }));
        setPages(json.pages);
        if ("queue" in json) setQueue(json.queue ?? null);
        if (isTerminal(json.audit.status)) {
          stoppedRef.current = true;
          await fetchFullOnce();
        }
      } catch {
        failuresRef.current += 1;
        if (
          failuresRef.current >= FAILURE_TOAST_THRESHOLD &&
          !toastedFailure
        ) {
          toastedFailure = true;
          toast.error("Lost connection to the scan feed; retrying…");
        }
      } finally {
        inFlightRef.current = false;
        scheduleNext();
      }
    };

    const onVisibility = () => {
      if (cancelled || stoppedRef.current) return;
      if (!document.hidden) {
        // User came back — give them the fastest cadence again.
        pollStartedAt = Date.now();
        if (timeoutId) clearTimeout(timeoutId);
        void tick();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    void tick();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId) clearTimeout(timeoutId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [initialAudit.id]);

  const siteWide = useMemo(() => {
    return Array.isArray(audit.site_wide_checks)
      ? (audit.site_wide_checks as AuditCheck[])
      : [];
  }, [audit.site_wide_checks]);

  const cruxField =
    Array.isArray(audit.crux_field_checks) ? (audit.crux_field_checks as AuditCheck[]) : [];
  return (
    <>
      <AuditScoreCard audit={audit} queue={queue} />

      {siteWide.length > 0 ? (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Site-wide probes</CardTitle>
            <CardDescription>
              Domain-wide signals (robots.txt, sitemap, AI bot rules) plus crawl-graph metrics for{" "}
              <strong className="font-medium text-foreground">URLs in this scan</strong> (orphans, depth from seed,
              anchor-text quality). Expand a row to see evidence such as orphan URLs.
            </CardDescription>
          </CardHeader>
          <div className="px-4 pb-4 sm:px-6">
            <CheckList title="" checks={siteWide} explanationLayout="collapsible" />
          </div>
        </Card>
      ) : null}

      {cruxField.length > 0 ? (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Chrome UX Report (field data)</CardTitle>
            <CardDescription>
              Real-user data from Google for your site&apos;s <strong className="font-medium text-foreground">origin</strong>{" "}
              (hostname)—not per URL. Numbers below are typical experiences (often p75).{" "}
              <strong className="font-medium text-foreground">Green is good; red needs attention.</strong>{" "}
              Powered by Google&apos;s real-user measurement data.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4 px-4 pb-4 sm:px-6">
            {hasCruxHistogramMetrics(cruxField) ? (
              <CruxVitalsOverview checks={cruxField} />
            ) : null}
            <details
              className="rounded-lg border border-border bg-muted/25"
              open={!hasCruxHistogramMetrics(cruxField)}
            >
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-foreground">
                {hasCruxHistogramMetrics(cruxField)
                  ? "Full breakdown and detailed improvement tips"
                  : "Details"}
              </summary>
              <div className="border-t border-border px-4 pb-4 pt-2">
                <CheckList
                  title=""
                  checks={cruxField}
                  explanationLayout="collapsible"
                />
              </div>
            </details>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pages</h2>
        {pages.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No page results yet"
            description={
              audit.status === "failed"
                ? "This visibility scan did not complete successfully. Try running a new scan from the community."
                : audit.status === "cancelled"
                  ? "This visibility scan was cancelled before any pages were scored."
                  : audit.status === "running" || audit.status === "pending"
                    ? "Pages will stream in here as they are scored."
                    : "No HTML pages were fetched (empty crawl or all fetches failed)."
            }
          />
        ) : (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Scanned URLs</CardTitle>
              <CardDescription>
                Click a row for the full breakdown — checks and suggested fixes.
              </CardDescription>
            </CardHeader>
            <div className="px-4 pb-2 sm:px-6">
              {pageGroups.map((group, idx) => (
                <div
                  key={group.label}
                  className={idx > 0 ? "mt-6 border-t border-border pt-6" : undefined}
                >
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    {group.label}
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({group.items.length})
                    </span>
                  </h3>
                  <div>
                    {group.items.map((p) => (
                      <AuditPageRow
                        key={p.id}
                        auditId={audit.id}
                        page={p}
                        prior={priorByUrl?.[p.url]}
                        removeEnabled={isTerminal(audit.status)}
                        onRemoved={(rollup: RemoveAuditPageSuccess) => {
                          setPages((prev) =>
                            prev.filter((row) => row.id !== p.id),
                          );
                          setAudit((prev) => ({
                            ...prev,
                            seo_score: rollup.seo_score,
                            geo_score: rollup.geo_score,
                            score: rollup.score,
                            pages_crawled: rollup.pages_crawled,
                            progress_total: rollup.progress_total,
                          }));
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
