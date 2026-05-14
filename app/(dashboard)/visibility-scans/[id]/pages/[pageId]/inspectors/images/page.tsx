import { CheckCircle2, Image as ImageIcon } from "lucide-react";

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

function severityConfig(missing: number): {
  label: string;
  sublabel: string;
  card: string;
  count: string;
} {
  if (missing === 0) {
    return {
      label: "All images have alt text",
      sublabel: "No accessibility issues detected",
      card: "border-emerald-500/30 bg-emerald-500/10",
      count: "text-emerald-700 dark:text-emerald-400",
    };
  }
  if (missing <= 3) {
    return {
      label: `${missing} image${missing === 1 ? "" : "s"} missing alt text`,
      sublabel: "Minor — fix these for better accessibility and AI parsing",
      card: "border-amber-500/30 bg-amber-500/10",
      count: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    label: `${missing} images missing alt text`,
    sublabel: "High impact — missing alt text hurts AI content parsing and screen readers",
    card: "border-destructive/30 bg-destructive/10",
    count: "text-destructive",
  };
}

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
  const sev = severityConfig(totalMissing);

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

      {/* Severity stat card */}
      <div className={`flex items-center gap-4 rounded-lg border px-5 py-4 ${sev.card}`}>
        {totalMissing === 0 ? (
          <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
        ) : (
          <span className={`text-4xl font-bold tabular-nums leading-none ${sev.count}`}>
            {totalMissing}
          </span>
        )}
        <div className="min-w-0">
          <p className={`font-semibold ${sev.count}`}>{sev.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sev.sublabel}</p>
        </div>
      </div>

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
