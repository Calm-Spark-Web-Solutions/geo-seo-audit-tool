"use client";

import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { RetryFailedPagesButton } from "@/components/audits/RetryFailedPagesButton";
import {
  isPartialCrawl,
  partialCrawlFailedCount,
  partialCrawlSummary,
} from "@/lib/audit/partial-crawl";
import { cn } from "@/lib/utils";
import type { Audit, AuditFetchFailure } from "@/types";

function formatFailureReason(reason: string): string {
  switch (reason) {
    case "fetch_network_or_abort":
      return "Network timeout or connection error";
    case "deadline_exceeded":
      return "Timed out (redirect chain too slow)";
    case "non_html_content_type":
      return "Response was not HTML";
    case "http_non_success":
      return "HTTP error response";
    default:
      return reason.replace(/_/g, " ");
  }
}

export function PartialCrawlBanner({
  audit,
  communityId,
  className,
}: {
  audit: Pick<
    Audit,
    "id" | "status" | "pages_crawled" | "progress_total" | "fetch_failures"
  >;
  communityId?: string;
  className?: string;
}) {
  if (!isPartialCrawl(audit)) return null;

  const failures = (audit.fetch_failures ?? []) as AuditFetchFailure[];
  const failedCount = partialCrawlFailedCount(audit);
  const hasList = failures.length > 0;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100",
        className,
      )}
    >
      <div className="flex gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="font-medium">Partial scan</p>
            <p className="text-xs leading-relaxed opacity-90">
              {partialCrawlSummary(audit)}
            </p>
          </div>
          {communityId && failedCount > 0 ? (
            <RetryFailedPagesButton
              communityId={communityId}
              sourceAuditId={audit.id}
              failedCount={failedCount}
            />
          ) : null}
        </div>
      </div>
      {hasList ? (
        <details className="group ml-6 rounded-md border border-amber-500/25 bg-amber-500/5">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden
            />
            Failed URLs ({failedCount})
          </summary>
          <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-amber-500/20 px-3 py-2 text-xs opacity-90">
            {failures.map((f) => (
              <li key={f.url} className="break-all">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 font-mono underline-offset-2 hover:underline"
                >
                  {f.url}
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-70" aria-hidden />
                </a>
                <span className="text-muted-foreground dark:text-amber-200/70">
                  {" "}
                  — {formatFailureReason(f.reason)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : failedCount > 0 ? (
        <p className="ml-6 text-xs opacity-80">
          {failedCount} URL{failedCount === 1 ? "" : "s"} failed to load.
        </p>
      ) : null}
    </div>
  );
}
