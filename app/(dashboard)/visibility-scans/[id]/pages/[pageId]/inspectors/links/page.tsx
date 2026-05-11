import { Link as LinkIcon } from "lucide-react";

import { InspectorLinksTable } from "@/components/audits/InspectorLinksTable";
import { InspectorHeader } from "@/components/audits/InspectorHeader";
import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { findInspectorEvidence, loadInspectorContext } from "@/lib/audit/inspector";
import type { AuditCheckEvidenceItem } from "@/types";

export const dynamic = "force-dynamic";

export default async function InternalLinksInspectorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });
  const match = findInspectorEvidence(ctx.checks, "links", ["internal_links"]);

  const items: Extract<AuditCheckEvidenceItem, { type: "link" }>[] =
    match?.evidence.items.filter(
      (i): i is Extract<AuditCheckEvidenceItem, { type: "link" }> =>
        i.type === "link",
    ) ?? [];
  const totalCount = match?.evidence.totalCount ?? items.length;

  const hostBreakdown = new Map<string, number>();
  for (const it of items) {
    try {
      const host = new URL(it.url).host;
      hostBreakdown.set(host, (hostBreakdown.get(host) ?? 0) + 1);
    } catch {
      hostBreakdown.set("(unparsed)", (hostBreakdown.get("(unparsed)") ?? 0) + 1);
    }
  }

  return (
    <>
      <PageDetailNav auditId={auditId} pageId={pageId} />

      <InspectorHeader
        auditId={auditId}
        pageId={pageId}
        pageUrl={ctx.page.url}
        title="Internal links"
        description={
          <span>
            {totalCount} link{totalCount === 1 ? "" : "s"} captured
            {items.length < totalCount ? ` (showing ${items.length} sample)` : ""}
          </span>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={LinkIcon}
          title="Sample data not captured"
          description="This scan ran before per-link sampling shipped. Re-run the visibility scan to populate the internal-links inspector."
        />
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Summary</CardTitle>
              <CardDescription>
                Breakdown of unique destinations seen on this page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Total internal links
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {totalCount}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Unique sample
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {items.length}
                  </dd>
                </div>
              </dl>
              {hostBreakdown.size > 1 ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {[...hostBreakdown.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([host, count]) => (
                      <li
                        key={host}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs"
                      >
                        <span className="font-mono">{host}</span>
                        <span className="text-muted-foreground">· {count}</span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>

          <InspectorLinksTable items={items} />
        </>
      )}
    </>
  );
}
