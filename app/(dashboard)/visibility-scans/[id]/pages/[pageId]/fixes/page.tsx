import { ArrowLeft, ExternalLink, Wrench } from "lucide-react";
import Link from "next/link";

import { FixesList } from "@/components/audits/FixesList";
import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadInspectorContext } from "@/lib/audit/inspector";
import type { FixItem, FixPriority } from "@/types";

export const dynamic = "force-dynamic";

const PRIORITY_META: Record<
  FixPriority,
  { label: string; chip: string; stat: string }
> = {
  high: {
    label: "High",
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    stat: "text-destructive",
  },
  medium: {
    label: "Medium",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    stat: "text-amber-600 dark:text-amber-400",
  },
  low: {
    label: "Low",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    stat: "text-emerald-600 dark:text-emerald-400",
  },
};

export default async function AuditPageFixesPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });
  const fixes = (ctx.page.fixes ?? []) as FixItem[];

  const highCount = fixes.filter((f) => f.priority === "high").length;
  const medCount = fixes.filter((f) => f.priority === "medium").length;
  const lowCount = fixes.filter((f) => f.priority === "low").length;

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
        title="Suggested fixes"
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
            <span>
              Prioritized recommendations to improve this page&rsquo;s SEO and
              GEO posture.
            </span>
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

      {fixes.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Nothing to fix"
          description="The scan engine didn't surface any prioritized recommendations for this URL — every check passed cleanly."
        />
      ) : (
        <>
          {/* Priority summary */}
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { priority: "high" as const, count: highCount },
                { priority: "medium" as const, count: medCount },
                { priority: "low" as const, count: lowCount },
              ] as const
            ).map(({ priority, count }) => {
              const meta = PRIORITY_META[priority];
              return (
                <div
                  key={priority}
                  className={`rounded-lg border px-4 py-3 ${meta.chip}`}
                >
                  <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                    {meta.label} priority
                  </p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${meta.stat}`}>
                    {count}
                  </p>
                </div>
              );
            })}
          </div>

          <Card>
            <CardContent className="pt-6">
              <FixesList fixes={fixes} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
