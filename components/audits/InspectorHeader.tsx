import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

export function InspectorHeader({
  auditId,
  pageId,
  pageUrl,
  title,
  description,
}: {
  auditId: string;
  pageId: string;
  pageUrl: string;
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <PageHeader
      eyebrow={
        <Link href={`/visibility-scans/${auditId}/pages/${pageId}`} className="hover:underline">
          {pageUrl}
        </Link>
      }
      title={title}
      description={
        <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <a
            href={pageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            Open page in new tab
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          {description ? (
            <>
              <span aria-hidden>·</span>
              {description}
            </>
          ) : null}
        </span>
      }
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href={`/visibility-scans/${auditId}/pages/${pageId}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to page
          </Link>
        </Button>
      }
    />
  );
}
