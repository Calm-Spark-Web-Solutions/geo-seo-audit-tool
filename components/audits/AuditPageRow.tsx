import { ChevronRight, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import Link from "next/link";

import { diffPage } from "@/lib/audit/diff";
import type { AuditCheck, AuditPage, FixItem } from "@/types";

export type PriorPageSnapshot = {
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
};

interface AuditPageRowProps {
  auditId: string;
  page: AuditPage;
  prior?: PriorPageSnapshot;
}

/**
 * Compact link row for the audit detail list. The whole row navigates to
 * `/visibility-scans/{auditId}/pages/{pageId}` for the full breakdown; the small
 * external-link affordance stays an `<a>` so users can open the audited
 * URL in a new tab without leaving the list.
 */
export function AuditPageRow({ auditId, page, prior }: AuditPageRowProps) {
  const seo = (page.seo_results ?? []) as AuditCheck[];
  const geo = (page.geo_results ?? []) as AuditCheck[];
  const fixes = (page.fixes ?? []) as FixItem[];

  const totals = countResults([...seo, ...geo]);
  const totalChecks = seo.length + geo.length;
  const deltaCount =
    prior && (seo.length > 0 || geo.length > 0)
      ? diffPage(
          { seo_results: seo, geo_results: geo },
          { seo_results: prior.seo_results, geo_results: prior.geo_results },
        ).length
      : 0;

  const summary =
    totalChecks === 0
      ? "Awaiting checks…"
      : [
          `${totals.pass} pass`,
          totals.warn > 0 ? `${totals.warn} warn` : null,
          totals.fail > 0 ? `${totals.fail} fail` : null,
          fixes.length > 0
            ? `${fixes.length} fix${fixes.length === 1 ? "" : "es"}`
            : null,
          deltaCount > 0
            ? `${deltaCount} change${deltaCount === 1 ? "" : "s"} vs prior`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="group relative flex items-center gap-3 border-b border-border py-3 transition-colors last:border-0 hover:bg-muted/30">
      <Link
        href={`/visibility-scans/${auditId}/pages/${page.id}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-1 -mx-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View detailed audit results for ${page.url}`}
      >
        <span className="truncate text-sm font-medium">{page.url}</span>
        <span className="text-xs text-muted-foreground">{summary}</span>
      </Link>
      <a
        href={page.url}
        target="_blank"
        rel="noreferrer"
        className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
        aria-label="Open page in new tab"
        title="Open page in new tab"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
      <span className="flex shrink-0 items-center gap-2">
        {page.exclude_from_audit_score ? (
          <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
            Rollup off
          </Badge>
        ) : null}
        <span className="text-sm font-semibold tabular-nums">
          {page.score ?? "—"}
        </span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </div>
  );
}

function countResults(checks: AuditCheck[]): {
  pass: number;
  warn: number;
  fail: number;
} {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of checks) {
    if (c.result === "pass") pass += 1;
    else if (c.result === "warn") warn += 1;
    else fail += 1;
  }
  return { pass, warn, fail };
}
