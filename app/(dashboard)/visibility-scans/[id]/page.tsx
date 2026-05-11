import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditDetailLive } from "@/components/audits/AuditDetailLive";
import { DeleteAuditButton } from "@/components/audits/DeleteAuditButton";
import { PdfActions } from "@/components/audits/PdfActions";
import { CommunityManualChecklist } from "@/components/communities/CommunityManualChecklist";
import { InlineErrorCard } from "@/components/layout/InlineErrorCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type {
  Audit,
  AuditCheck,
  AuditPage,
  AuditQueueDiagnostics,
  Community,
  CommunityManualResults,
} from "@/types";

export type PriorPageSnapshot = {
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
};

export const dynamic = "force-dynamic";

export default async function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: audit, error: auditError }, { data: pages }, { data: auditJob }] =
    await Promise.all([
      supabase
        .from("audits")
        .select(
          "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, site_wide_checks, crux_field_checks, engine_version, report_pdf_path, report_generated_at, created_at",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("audit_pages")
        .select(
          "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, exclude_from_audit_score, sitemap_category_label, created_at",
        )
        .eq("audit_id", id)
        .order("score", { ascending: false, nullsFirst: false }),
      supabase
        .from("audit_jobs")
        .select("last_error, attempts, max_attempts")
        .eq("audit_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (auditError) {
    return (
      <InlineErrorCard
        title="Could not load visibility scan"
        description={auditError.message}
      />
    );
  }

  if (!audit) notFound();

  const typedAudit = audit as Audit;
  const typedPages = (pages ?? []) as AuditPage[];

  const initialQueue: AuditQueueDiagnostics | null = auditJob
    ? {
        lastError: auditJob.last_error,
        attempts: auditJob.attempts,
        maxAttempts: auditJob.max_attempts,
      }
    : null;

  const [{ data: community }, { data: priorAudit }] = await Promise.all([
    supabase
      .from("communities")
      .select("id, name, company_id, facility_type, manual_check_results")
      .eq("id", typedAudit.community_id)
      .maybeSingle(),
    supabase
      .from("audits")
      .select("id, created_at")
      .eq("community_id", typedAudit.community_id)
      .eq("status", "complete")
      .lt("created_at", typedAudit.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  type CommunityRow = Community & {
    manual_check_results: CommunityManualResults | null;
  };
  const typedCommunity = community as CommunityRow | null;

  let priorByUrl: Record<string, PriorPageSnapshot> = {};
  if (priorAudit?.id) {
    const { data: priorPages } = await supabase
      .from("audit_pages")
      .select("url, seo_results, geo_results")
      .eq("audit_id", priorAudit.id);
    if (priorPages) {
      const acc: Record<string, PriorPageSnapshot> = {};
      for (const p of priorPages) {
        const row = p as PriorPageSnapshot & { url: string };
        acc[row.url] = {
          seo_results: row.seo_results,
          geo_results: row.geo_results,
        };
      }
      priorByUrl = acc;
    }
  }

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
            "Community"
          )
        }
        title="Visibility scan"
        description={
          <span className="flex flex-col gap-1">
            <span>Per-page SEO and GEO checks with AI commentary.</span>
            {typedCommunity?.facility_type ? (
              <span className="text-muted-foreground">
                Facility type · {typedCommunity.facility_type}
              </span>
            ) : null}
          </span>
        }
        actions={
          <DeleteAuditButton
            auditId={typedAudit.id}
            auditLabel={new Date(typedAudit.created_at).toLocaleString()}
            disabled={
              typedAudit.status === "pending" || typedAudit.status === "running"
            }
          />
        }
      />

      <PdfActions
        auditId={typedAudit.id}
        hasSavedPdf={Boolean(typedAudit.report_pdf_path)}
        generatedAt={typedAudit.report_generated_at}
      />

      <AuditDetailLive
        key={typedAudit.id}
        initialAudit={typedAudit}
        initialPages={typedPages}
        priorByUrl={priorByUrl}
        initialQueue={initialQueue}
      />

      {typedCommunity ? (
        <CommunityManualChecklist
          communityId={typedCommunity.id}
          initialResults={typedCommunity.manual_check_results}
          variant="collapsible"
        />
      ) : null}
    </>
  );
}
