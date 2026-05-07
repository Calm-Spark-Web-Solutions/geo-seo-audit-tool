import Link from "next/link";
import { notFound } from "next/navigation";

import { PdfActions } from "@/components/audits/PdfActions";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Audit, Community } from "@/types";

export const dynamic = "force-dynamic";

export default async function AuditExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: audit } = await supabase
    .from("audits")
    .select(
      "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, report_pdf_path, report_generated_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!audit) notFound();

  const typedAudit = audit as Audit;

  const { data: community } = await supabase
    .from("communities")
    .select("id, name, company_id")
    .eq("id", typedAudit.community_id)
    .maybeSingle();

  const typedCommunity = community as Community | null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/audits/${typedAudit.id}`} className="hover:underline">
            Back to audit
          </Link>
        }
        title="Export PDF"
        description="Preview the branded report and download or save it for sharing."
      />

      <PdfActions
        auditId={typedAudit.id}
        hasSavedPdf={Boolean(typedAudit.report_pdf_path)}
        generatedAt={typedAudit.report_generated_at}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {typedCommunity?.name ?? "Audit"} report
          </CardTitle>
          <CardDescription>
            Live render of the same PDF the download action streams. Loads
            inline from the secure API route.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border border-border bg-muted/40">
            <iframe
              title={`Audit ${typedAudit.id} PDF preview`}
              src={`/api/audits/${typedAudit.id}/report.pdf`}
              className="h-[80vh] w-full"
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
