import { Gauge } from "lucide-react";
import Link from "next/link";

import { InspectorHeader } from "@/components/audits/InspectorHeader";
import { LighthouseSection } from "@/components/audits/LighthouseSection";
import { RefreshAuditPageButtons } from "@/components/audits/RefreshAuditPageButtons";
import { RetryMissingPsiButton } from "@/components/audits/RetryMissingPsiButton";
import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadInspectorContext } from "@/lib/audit/inspector";
import { hasPsiCategories } from "@/lib/audit/psi-keys";
import { createClient } from "@/lib/supabase/server";
import type { AuditCheck } from "@/types";

export const dynamic = "force-dynamic";

interface MissingPageRow {
  id: string;
  url: string;
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
}

async function loadOtherPagesMissingPsi(opts: {
  auditId: string;
  excludePageId: string;
}): Promise<{ id: string; url: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_pages")
    .select("id, url, seo_results, geo_results")
    .eq("audit_id", opts.auditId)
    .neq("id", opts.excludePageId);

  if (!data) return [];

  const out: { id: string; url: string }[] = [];
  for (const row of data as MissingPageRow[]) {
    const seo = row.seo_results ?? [];
    const geo = row.geo_results ?? [];
    if (!hasPsiCategories([...seo, ...geo])) {
      out.push({ id: row.id, url: row.url });
    }
  }
  return out;
}

export default async function LighthouseInspectorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });

  const hasPsi = ctx.checks.some((c) => c.key.startsWith("psi_"));
  const otherMissing = await loadOtherPagesMissingPsi({
    auditId,
    excludePageId: pageId,
  });

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

      {otherMissing.length > 0 ? (
        <Card id="missing-elsewhere">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">
                Other pages missing Lighthouse in this scan
              </CardTitle>
              <CardDescription>
                {otherMissing.length} page{otherMissing.length === 1 ? "" : "s"}{" "}
                in this visibility scan still have no PageSpeed data. They will
                be retried automatically and you can also retry them in bulk
                here, or open each page to use the per-page button.
              </CardDescription>
            </div>
            <RetryMissingPsiButton
              auditId={auditId}
              missingCount={otherMissing.length}
            />
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {otherMissing.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    {p.url}
                  </span>
                  <Link
                    href={`/visibility-scans/${auditId}/pages/${p.id}/inspectors/lighthouse`}
                    className="shrink-0 text-xs font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Open Lighthouse inspector
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
