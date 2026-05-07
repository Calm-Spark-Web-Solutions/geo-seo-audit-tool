import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditDetailLive } from "@/components/audits/AuditDetailLive";
import { PdfActions } from "@/components/audits/PdfActions";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Audit, AuditPage, Community } from "@/types";

export const dynamic = "force-dynamic";

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: audit, error: auditError }, { data: pages }] =
    await Promise.all([
      supabase
        .from("audits")
        .select(
          "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, report_pdf_path, report_generated_at, created_at",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("audit_pages")
        .select(
          "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, created_at",
        )
        .eq("audit_id", id)
        .order("score", { ascending: false, nullsFirst: false }),
    ]);

  if (auditError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit</CardTitle>
          <CardDescription>{auditError.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!audit) notFound();

  const typedAudit = audit as Audit;
  const typedPages = (pages ?? []) as AuditPage[];

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
          typedCommunity ? (
            <Link
              href={`/communities/${typedCommunity.id}`}
              className="hover:underline"
            >
              {typedCommunity.name}
            </Link>
          ) : (
            "Audit"
          )
        }
        title="Audit report"
        description="Per-page SEO and GEO checks with AI commentary."
      />

      <PdfActions
        auditId={typedAudit.id}
        hasSavedPdf={Boolean(typedAudit.report_pdf_path)}
        generatedAt={typedAudit.report_generated_at}
      />

      <AuditDetailLive
        initialAudit={typedAudit}
        initialPages={typedPages}
      />
    </>
  );
}
