"use client";

import { FileSearch } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  CruxVitalsOverview,
  hasCruxHistogramMetrics,
} from "@/components/audits/CruxVitalsOverview";
import { AuditSection } from "@/components/audits/AuditSection";
import { CheckList } from "@/components/audits/CheckList";
import { AuditPageRow } from "@/components/audits/AuditPageRow";
import { AuditScoreCard } from "@/components/audits/AuditScoreCard";
import { PartialCrawlBanner } from "@/components/audits/PartialCrawlBanner";
import { PsiCoveragePanel } from "@/components/audits/PsiCoveragePanel";
import type { RemoveAuditPageSuccess } from "@/app/(dashboard)/visibility-scans/[id]/pages/[pageId]/actions";
import { GoogleMetricsCard } from "@/components/communities/GoogleMetricsCard";
import { EmptyState } from "@/components/layout/EmptyState";
import { isPartialCrawl, partialCrawlFailedCount } from "@/lib/audit/partial-crawl";
import { psiCoverageFromPages } from "@/lib/audit/psi-keys";
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

  const isComplete = audit.status === "complete";
  const partialCrawl = isComplete && isPartialCrawl(audit);
  const psi = useMemo(() => psiCoverageFromPages(pages), [pages]);
  const psiMissing = psi.total > 0 && psi.covered < psi.total;

  useEffect(() => {
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
    let pollStartedAt = Date.now();

    const scheduleNext = (delay?: number) => {
      if (cancelled || stoppedRef.current) return;
      const next = delay ?? pollIntervalForAge(Date.now() - pollStartedAt);
      timeoutId = setTimeout(tick, next);
    };

    const fetchFullOnce = async () => {
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
        // non-fatal
      }
    };

    const tick = async () => {
      if (cancelled || stoppedRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (inFlightRef.current) {
        scheduleNext();
        return;
      }
      inFlightRef.current = true;
      try {
        const res = await fetch(
          `/api/visibility-scans/${initialAudit.id}/snapshot?mode=light`,
          { cache: "no-store", signal: controller.signal },
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

  const cruxField = Array.isArray(audit.crux_field_checks)
    ? (audit.crux_field_checks as AuditCheck[])
    : [];

  const googleField = Array.isArray(audit.google_field_checks)
    ? (audit.google_field_checks as AuditCheck[])
    : [];

  const gscMapped = googleField.some(
    (c) => c.key === "gsc_property_linked" && c.result === "pass",
  );
  const ga4Mapped = googleField.some(
    (c) => c.key === "ga4_property_linked" && c.result === "pass",
  );
  const showGoogleMetricsCard =
    isComplete &&
    (audit.google_metrics != null ||
      gscMapped ||
      ga4Mapped ||
      googleField.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <AuditScoreCard audit={audit} queue={queue} />

      {showGoogleMetricsCard ? (
        <GoogleMetricsCard
          metrics={audit.google_metrics ?? null}
          mapped={{ gsc: gscMapped, ga4: ga4Mapped }}
          variant="audit"
          asOf={audit.created_at}
        />
      ) : null}

      {partialCrawl ? (
        <PartialCrawlBanner
          audit={audit}
          communityId={audit.community_id}
        />
      ) : null}

      {siteWide.length > 0 ? (
        <AuditSection
          title="Site-wide probes"
          description="Robots, sitemap, AI bot rules, and crawl-graph signals for URLs in this scan."
          badge={`${siteWide.length} checks`}
          defaultOpen={false}
        >
          <CheckList title="" checks={siteWide} explanationLayout="collapsible" />
        </AuditSection>
      ) : null}

      {googleField.length > 0 ? (
        <AuditSection
          title="Google Search Console & GA4"
          description="Property linkage and 28-day signals when your organization has Google connected."
          badge={`${googleField.length} checks`}
          defaultOpen={false}
        >
          <CheckList title="" checks={googleField} explanationLayout="collapsible" />
        </AuditSection>
      ) : null}

      {cruxField.length > 0 ? (
        <AuditSection
          title="Core Web Vitals (CrUX)"
          description="Real-user origin data from Google. Desktop is primary."
          defaultOpen={hasCruxHistogramMetrics(cruxField)}
        >
          <div className="flex flex-col gap-3">
            {hasCruxHistogramMetrics(cruxField) ? (
              <CruxVitalsOverview
                checks={cruxField}
                compact
                collapseMobile
              />
            ) : null}
            <details className="rounded-md border border-border bg-muted/20">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
                Full breakdown and tips
              </summary>
              <div className="border-t border-border px-3 pb-3 pt-2">
                <CheckList
                  title=""
                  checks={cruxField}
                  explanationLayout="collapsible"
                />
              </div>
            </details>
          </div>
        </AuditSection>
      ) : null}

      {isComplete && psiMissing ? (
        <AuditSection
          title="Lighthouse gaps"
          description={`${psi.total - psi.covered} page${psi.total - psi.covered === 1 ? "" : "s"} missing PageSpeed data`}
          badge={`${psi.covered}/${psi.total}`}
          defaultOpen={false}
        >
          <PsiCoveragePanel auditId={audit.id} pages={pages} />
        </AuditSection>
      ) : null}

      <AuditSection
        title="Scored pages"
        description="Open a row for checks, fixes, and Lighthouse."
        badge={
          pages.length > 0
            ? `${pages.length} scored`
            : partialCrawl
              ? `${audit.pages_crawled} / ${(audit.progress_total ?? 0) + partialCrawlFailedCount(audit)} planned`
              : undefined
        }
        defaultOpen
      >
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
          <div className="flex flex-col gap-4">
            {pageGroups.map((group, idx) => (
              <div
                key={group.label}
                className={idx > 0 ? "border-t border-border pt-4" : undefined}
              >
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                  <span className="ml-1.5 font-normal normal-case">
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
        )}
      </AuditSection>
    </div>
  );
}
