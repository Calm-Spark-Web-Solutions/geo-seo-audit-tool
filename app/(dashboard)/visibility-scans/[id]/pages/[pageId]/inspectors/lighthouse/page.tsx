import { Gauge } from "lucide-react";

import { InspectorHeader } from "@/components/audits/InspectorHeader";
import { LighthouseSection } from "@/components/audits/LighthouseSection";
import { RefreshAuditPageButtons } from "@/components/audits/RefreshAuditPageButtons";
import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { EmptyState } from "@/components/layout/EmptyState";
import { loadInspectorContext } from "@/lib/audit/inspector";

export const dynamic = "force-dynamic";

export default async function LighthouseInspectorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });

  const hasPsi = ctx.checks.some((c) => c.key.startsWith("psi_"));

  return (
    <>
      <PageDetailNav auditId={auditId} pageId={pageId} />

      <InspectorHeader
        auditId={auditId}
        pageId={pageId}
        pageUrl={ctx.page.url}
        title="Lighthouse details"
        description={
          hasPsi ? (
            <span>PageSpeed Insights category scores and failing audits.</span>
          ) : (
            <span>
              No PageSpeed Insights data captured for this run. Use{" "}
              <strong className="font-medium text-foreground">
                Run PageSpeed again
              </strong>{" "}
              below, or start a new visibility scan for the whole site.
            </span>
          )
        }
      />

      {hasPsi ? (
        <LighthouseSection
          checks={ctx.checks}
          pageRefresh={{ auditId, pageId }}
        />
      ) : (
        <EmptyState
          icon={Gauge}
          title="Lighthouse data not collected"
          description={
            <>
              PageSpeed may have been skipped, timed out, or returned no
              category scores. Try again for this URL only, re-analyze the full
              page (includes AI), or run a new visibility scan for the whole
              site.
              <br />
              <span className="text-xs">
                Running PageSpeed again usually takes about 15–45 seconds.
              </span>
            </>
          }
          actions={
            <RefreshAuditPageButtons
              auditId={auditId}
              pageId={pageId}
              layout="stacked"
            />
          }
        />
      )}
    </>
  );
}
