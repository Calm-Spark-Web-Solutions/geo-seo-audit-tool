import { ArrowRight, CircleAlert, CircleCheck, CircleX, Gauge } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { AuditCheck, AuditCheckEvidenceItem, CheckResult } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PSI_CATEGORY_KEYS = [
  "psi_performance",
  "psi_accessibility",
  "psi_best_practices",
  "psi_seo",
] as const;

type PsiCategoryKey = (typeof PSI_CATEGORY_KEYS)[number];

const TILE_LABEL: Record<PsiCategoryKey, string> = {
  psi_performance: "Performance",
  psi_accessibility: "Accessibility",
  psi_best_practices: "Best Practices",
  psi_seo: "SEO",
};

function ResultIcon({ result }: { result: CheckResult }) {
  if (result === "pass")
    return (
      <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-500" aria-hidden />
    );
  if (result === "warn")
    return (
      <CircleAlert className="h-4 w-4 text-amber-600 dark:text-amber-500" aria-hidden />
    );
  return <CircleX className="h-4 w-4 text-destructive" aria-hidden />;
}

function scoreTone(score: number | undefined): string {
  if (typeof score !== "number") return "text-muted-foreground";
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function LighthouseSection({
  checks,
  variant = "full",
  detailsHref,
}: {
  checks: AuditCheck[];
  /** "summary" renders just the four tiles + a "View details" link. */
  variant?: "summary" | "full";
  /** Required when variant === "summary"; overview page passes the inspector route. */
  detailsHref?: string;
}) {
  const byKey = new Map(checks.map((c) => [c.key, c] as const));
  const tiles = PSI_CATEGORY_KEYS.map((key) => byKey.get(key)).filter(
    (c): c is AuditCheck => Boolean(c),
  );

  if (tiles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
            Lighthouse
          </CardTitle>
          <CardDescription>
            Performance, accessibility, best-practices, and SEO signals from
            PageSpeed Insights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Lighthouse data was not collected for this run. Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              PSI_API_KEY
            </code>{" "}
            and re-run the visibility scan to populate this section.
          </p>
        </CardContent>
      </Card>
    );
  }

  const allFailingByCategory = tiles
    .map((tile) => {
      const psi =
        (tile.evidence?.items ?? []).filter(
          (i): i is Extract<AuditCheckEvidenceItem, { type: "psi_audit" }> =>
            i.type === "psi_audit",
        ) ?? [];
      return { tile, psi };
    })
    .filter((g) => g.psi.length > 0);

  const totalFailing = allFailingByCategory.reduce(
    (acc, g) => acc + g.psi.length,
    0,
  );

  const tilesGrid = (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => {
        const label =
          TILE_LABEL[tile.key as PsiCategoryKey] ?? tile.label;
        return (
          <li
            key={tile.key}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p
                className={cn(
                  "mt-1 text-2xl font-semibold tabular-nums",
                  scoreTone(tile.score),
                )}
              >
                {typeof tile.score === "number" ? tile.score : "—"}
              </p>
            </div>
            <ResultIcon result={tile.result} />
          </li>
        );
      })}
    </ul>
  );

  if (variant === "summary") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
              Lighthouse
            </CardTitle>
            <CardDescription>
              {totalFailing > 0
                ? `${totalFailing} failing or warning audit${totalFailing === 1 ? "" : "s"} across PageSpeed categories.`
                : "All categories look healthy."}
            </CardDescription>
          </div>
          {detailsHref ? (
            <Link
              href={detailsHref}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              View details
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </CardHeader>
        <CardContent>{tilesGrid}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
          Lighthouse
        </CardTitle>
        <CardDescription>
          PageSpeed Insights summary for this URL. Detailed audits live in the
          SEO and GEO check tabs below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {tilesGrid}

        {allFailingByCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No failing or warning audits surfaced — Lighthouse is happy with
            this page.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-medium">
              Failing &amp; warning audits
            </h3>
            <ul className="flex flex-col gap-4">
              {allFailingByCategory.map(({ tile, psi }) => (
                <li key={tile.key}>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {TILE_LABEL[tile.key as PsiCategoryKey] ?? tile.label}
                  </h4>
                  <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                    {psi.slice(0, 8).map((a) => {
                      const pct =
                        a.score !== null && Number.isFinite(a.score)
                          ? `${Math.round(a.score * 100)}/100`
                          : "n/a";
                      return (
                        <li
                          key={a.id}
                          className="flex flex-col gap-1 px-3 py-2 text-sm"
                        >
                          <div className="flex items-start gap-2">
                            <ResultIcon result={a.result} />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{a.title}</p>
                              <p className="text-xs text-muted-foreground">
                                <span className="tabular-nums">{pct}</span>
                                {a.displayValue ? <> · {a.displayValue}</> : null}
                              </p>
                              {a.description ? (
                                <details className="mt-1 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer select-none hover:underline">
                                    Details
                                  </summary>
                                  <p className="mt-1 whitespace-pre-line leading-relaxed">
                                    {a.description}
                                  </p>
                                </details>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {psi.length > 8 ? (
                      <li className="px-3 py-2 text-xs text-muted-foreground">
                        +{psi.length - 8} more not shown
                      </li>
                    ) : null}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
