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

type LinkItem = Extract<AuditCheckEvidenceItem, { type: "link" }>;

function linkItemsFrom(
  items: AuditCheckEvidenceItem[] | undefined,
): LinkItem[] {
  return (
    items?.filter(
      (i): i is LinkItem => i.type === "link",
    ) ?? []
  );
}

export default async function InternalLinksInspectorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });
  const match = findInspectorEvidence(ctx.checks, "links", ["internal_links"]);

  const contentItems = linkItemsFrom(match?.evidence.items);
  const chromeItems = linkItemsFrom(match?.evidence.chromeItems);
  const contentTotal = match?.evidence.totalCount ?? contentItems.length;
  const chromeTotal = match?.evidence.chromeTotalCount ?? chromeItems.length;
  const hasSamples = contentItems.length > 0 || chromeItems.length > 0;

  const hostBreakdown = new Map<string, number>();
  for (const it of [...contentItems, ...chromeItems]) {
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
            {contentTotal} in-content link{contentTotal === 1 ? "" : "s"}
            {chromeTotal > 0
              ? ` · ${chromeTotal} in navigation or footer`
              : ""}
            {contentItems.length < contentTotal
              ? ` (showing ${contentItems.length} in-content sample${contentItems.length === 1 ? "" : "s"})`
              : ""}
          </span>
        }
      />

      {!hasSamples ? (
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
                In-content links are inside primary page content (not global
                navigation or footer). These are the links that usually help
                readers and AI crawlers discover related topics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-card px-4 py-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    In-content links
                  </dt>
                  <dd className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                    {contentTotal}
                  </dd>
                </div>
                <div className="rounded-md border border-border bg-card px-4 py-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Navigation &amp; footer
                  </dt>
                  <dd className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                    {chromeTotal}
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

          {contentItems.length > 0 ? (
            <InspectorLinksTable
              items={contentItems}
              title="In-content links"
              description="Contextual links inside primary page content — these count toward the internal links check."
            />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">In-content links</CardTitle>
                <CardDescription>
                  No in-content internal links were found on this page. Add
                  contextual links in the body to related services, resources,
                  and next steps.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {chromeItems.length > 0 ? (
            <InspectorLinksTable
              items={chromeItems}
              title="Navigation & footer"
              description="Global site chrome — shown for reference; these do not count toward the internal links score."
              className="opacity-90"
            />
          ) : null}
        </>
      )}
    </>
  );
}
