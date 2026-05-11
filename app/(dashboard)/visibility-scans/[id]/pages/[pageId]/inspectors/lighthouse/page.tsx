import { Gauge } from "lucide-react";

import { InspectorHeader } from "@/components/audits/InspectorHeader";
import { LighthouseSection } from "@/components/audits/LighthouseSection";
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
            <span>No PageSpeed Insights data captured for this run.</span>
          )
        }
      />

      {hasPsi ? (
        <LighthouseSection checks={ctx.checks} />
      ) : (
        <EmptyState
          icon={Gauge}
          title="Lighthouse data not collected"
          description={
            "Set PSI_API_KEY and re-run the visibility scan to populate Lighthouse details for this page."
          }
        />
      )}
    </>
  );
}
