import { ArrowLeft, ExternalLink, Wrench } from "lucide-react";
import Link from "next/link";

import { FixesList } from "@/components/audits/FixesList";
import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadInspectorContext } from "@/lib/audit/inspector";
import type { FixItem } from "@/types";

export const dynamic = "force-dynamic";

export default async function AuditPageFixesPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });
  const fixes = (ctx.page.fixes ?? []) as FixItem[];

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
              Prioritized recommendations to improve this page&rsquo;s SEO and GEO posture.
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
        <Card>
          <CardContent className="pt-6">
            <FixesList fixes={fixes} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
