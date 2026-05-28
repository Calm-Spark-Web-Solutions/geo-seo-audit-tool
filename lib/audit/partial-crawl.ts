import type { AuditFetchFailure } from "@/types";

/** Planned URL count for a completed or in-progress scan. */
export function auditPlannedPageCount(audit: {
  progress_total: number | null;
  pages_crawled: number;
  fetch_failures?: AuditFetchFailure[] | null;
}): number {
  const total = audit.progress_total ?? 0;
  if (total > 0) return total;
  const failed = audit.fetch_failures?.length ?? 0;
  return audit.pages_crawled + failed;
}

/** True when some planned URLs were not scored (fetch failures). */
export function isPartialCrawl(audit: {
  status: string;
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): boolean {
  if (audit.status !== "complete") return false;
  const planned = auditPlannedPageCount(audit);
  if (planned <= 0) return false;
  const failed =
    audit.fetch_failures?.length ??
    Math.max(0, planned - audit.pages_crawled);
  return failed > 0 && audit.pages_crawled < planned;
}

export function partialCrawlFailedCount(audit: {
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): number {
  const planned = auditPlannedPageCount(audit);
  if (audit.fetch_failures?.length) return audit.fetch_failures.length;
  return Math.max(0, planned - audit.pages_crawled);
}

export type ScanCoverageKind = "full" | "partial" | "none" | "running";

/** Fraction of planned URLs that were successfully scored (0–1). */
export function crawlCoverageRatio(audit: {
  status: string;
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): number | null {
  if (audit.status === "pending" || audit.status === "running") return null;
  const planned = auditPlannedPageCount(audit);
  if (planned <= 0) return null;
  return Math.min(1, audit.pages_crawled / planned);
}

export function isLowConfidenceCrawl(audit: {
  status: string;
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): boolean {
  const ratio = crawlCoverageRatio(audit);
  return ratio !== null && ratio < 0.8;
}

export function scanCoverageKind(audit: {
  status: string;
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): ScanCoverageKind {
  if (audit.status === "pending" || audit.status === "running") return "running";
  const planned = auditPlannedPageCount(audit);
  if (planned <= 0 || audit.pages_crawled === 0) return "none";
  if (isPartialCrawl(audit)) return "partial";
  return "full";
}

/** Human-readable crawl line for lists, e.g. "17 / 19 pages". */
export function crawlCoverageLabel(audit: {
  status: string;
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): string {
  if (audit.status === "pending" || audit.status === "running") {
    const total = audit.progress_total ?? 0;
    if (total > 0) return `${audit.pages_crawled} / ${total} pages`;
    return "starting…";
  }
  const planned = auditPlannedPageCount(audit);
  if (planned <= 0) {
    return audit.pages_crawled
      ? `${audit.pages_crawled} page${audit.pages_crawled === 1 ? "" : "s"}`
      : "no pages";
  }
  return `${audit.pages_crawled} / ${planned} page${planned === 1 ? "" : "s"}`;
}

export function lowConfidenceScoreNote(audit: {
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): string {
  const planned = auditPlannedPageCount(audit);
  return `Based on ${audit.pages_crawled} of ${planned} planned page${planned === 1 ? "" : "s"} — rerun for a full-site score.`;
}

export function partialCrawlSummary(audit: {
  pages_crawled: number;
  progress_total: number | null;
  fetch_failures?: AuditFetchFailure[] | null;
}): string {
  const planned = auditPlannedPageCount(audit);
  const failed = partialCrawlFailedCount(audit);
  return `Scored ${audit.pages_crawled} of ${planned} planned page${planned === 1 ? "" : "s"}; ${failed} fetch${failed === 1 ? "" : "es"} failed. Site scores may not represent the full site — rerun the scan or check that the host allows automated crawlers.`;
}
