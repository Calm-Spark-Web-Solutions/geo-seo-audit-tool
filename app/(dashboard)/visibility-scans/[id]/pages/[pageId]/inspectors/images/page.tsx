import { Image as ImageIcon } from "lucide-react";

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

export default async function ImagesInspectorPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });
  const match = findInspectorEvidence(ctx.checks, "images", ["img_alt"]);

  const items: Extract<AuditCheckEvidenceItem, { type: "image" }>[] =
    match?.evidence.items.filter(
      (i): i is Extract<AuditCheckEvidenceItem, { type: "image" }> =>
        i.type === "image",
    ) ?? [];
  const totalMissing = match?.evidence.totalCount ?? items.length;

  return (
    <>
      <PageDetailNav auditId={auditId} pageId={pageId} />

      <InspectorHeader
        auditId={auditId}
        pageId={pageId}
        pageUrl={ctx.page.url}
        title="Images & alt text"
        description={
          <span>
            {totalMissing} image{totalMissing === 1 ? "" : "s"} missing alt text
            {items.length < totalMissing
              ? ` (showing first ${items.length})`
              : ""}
          </span>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={
            totalMissing === 0
              ? "All images have alt text"
              : "Sample data not captured"
          }
          description={
            totalMissing === 0
              ? "No accessibility issues with image alt text were detected on this page."
              : "This scan ran before image sampling shipped. Re-run the visibility scan to populate the images inspector."
          }
        />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Missing alt text</CardTitle>
            <CardDescription>
              Each entry shows the image source and any nearby copy that hints
              at what the image conveys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {items.map((it, i) => (
                <li key={`${it.src}-${i}`} className="flex gap-3 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.src}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-md border border-border object-cover bg-muted/40"
                  />
                  <div className="min-w-0 flex-1">
                    <a
                      href={it.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all font-mono text-xs text-foreground hover:underline"
                    >
                      {it.src}
                    </a>
                    {it.nearText ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nearby copy: {it.nearText}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        No surrounding copy captured.
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
