import { ArrowLeft, ExternalLink, Lightbulb } from "lucide-react";
import Link from "next/link";

import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { PageDetailStatBar } from "@/components/audits/PageDetailStatBar";
import { SeoGeoCheckTabs } from "@/components/audits/SeoGeoCheckTabs";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { loadInspectorContext, tallyChecks } from "@/lib/audit/inspector";
import { checksCountingTowardScore } from "@/lib/scoring/effective-scores";
import type { FixItem } from "@/types";

export const dynamic = "force-dynamic";

export default async function AuditPageChecksPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });
  const seoTally = tallyChecks(checksCountingTowardScore(ctx.seo));
  const geoTally = tallyChecks(checksCountingTowardScore(ctx.geo));
  const totalChecks = ctx.seo.length + ctx.geo.length;
  const fixes = (ctx.page.fixes ?? []) as FixItem[];
  const auditedAt = new Date(ctx.audit.created_at).toLocaleString();

  return (
    <>
      <PageDetailNav auditId={auditId} pageId={pageId} />

      <PageHeader
        eyebrow={
          <Link
            href={`/visibility-scans/${auditId}/pages/${pageId}`}
            className="hover:underline"
          >
            {ctx.page.url}
          </Link>
        }
        title="All checks"
        description={
          <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <a
              href={ctx.page.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Open page in new tab
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <span aria-hidden>·</span>
            <span>Passing rows are hidden by default — toggle to reveal them.</span>
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/visibility-scans/${auditId}/pages/${pageId}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to overview
            </Link>
          </Button>
        }
      />

      {/* Score context at top of checks view */}
      <PageDetailStatBar
        score={ctx.page.score ?? null}
        excluded={ctx.page.exclude_from_audit_score ?? false}
        seoTally={seoTally}
        geoTally={geoTally}
        fixCount={fixes.length}
        auditedAt={auditedAt}
      />

      {totalChecks === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No checks recorded yet"
          description={
            ctx.audit.status === "running" || ctx.audit.status === "pending"
              ? "Checks will appear here as the scan engine finishes scoring this URL."
              : "This URL did not produce check results in this audit run."
          }
        />
      ) : (
        <SeoGeoCheckTabs
          seo={ctx.seo}
          geo={ctx.geo}
          seoTally={seoTally}
          geoTally={geoTally}
          auditId={auditId}
          pageId={pageId}
        />
      )}
    </>
  );
}
