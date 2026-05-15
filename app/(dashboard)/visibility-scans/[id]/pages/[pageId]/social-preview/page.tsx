import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";

import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { SocialPreviewPanel } from "@/components/audits/SocialPreviewPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { fetchPageWithMeta } from "@/lib/crawler/fetch";
import { loadInspectorContext } from "@/lib/audit/inspector";
import { extractSocialPreviewMeta } from "@/lib/social-preview/extract";

export const dynamic = "force-dynamic";

export default async function AuditPageSocialPreviewPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const ctx = await loadInspectorContext({ auditId, pageId });

  const fetched = await fetchPageWithMeta(ctx.page.url);
  const meta =
    fetched !== null
      ? extractSocialPreviewMeta(fetched.html, fetched.meta.finalUrl)
      : null;

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
        title="Social preview"
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

      <section aria-labelledby="social-preview-heading" className="mt-6">
        <h2 id="social-preview-heading" className="sr-only">
          Social preview mockups
        </h2>
        <SocialPreviewPanel
          auditedUrl={ctx.page.url}
          meta={meta}
          fetchFailed={fetched === null}
        />
      </section>
    </>
  );
}
