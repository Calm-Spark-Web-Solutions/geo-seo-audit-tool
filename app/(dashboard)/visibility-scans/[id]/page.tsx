import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditDetailLive } from "@/components/audits/AuditDetailLive";
import { DeleteAuditButton } from "@/components/audits/DeleteAuditButton";
import { PdfActions } from "@/components/audits/PdfActions";
import { CommunityManualChecklist } from "@/components/communities/CommunityManualChecklist";
import { InlineErrorCard } from "@/components/layout/InlineErrorCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { EXPERT_CHECKLIST_CARD_DESCRIPTION } from "@/lib/checklists/expert-checklist-copy";
import { userAllowedPdfExport } from "@/lib/billing/subscription-access";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const stripeOn = isStripeConfigured();
  let pdfExportAllowed = true;
  if (user && stripeOn) {
    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    pdfExportAllowed = userAllowedPdfExport(stripeOn, subRow);
  }

  const [{ data: audit, error: auditError }, { data: pages }, { data: auditJob }] =
    await Promise.all([
      supabase
        .from("audits")
        .select(
          "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, fetch_failures, site_wide_checks, crux_field_checks, google_field_checks, google_metrics, engine_version, report_pdf_path, report_generated_at, created_at",
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
        .select(
          "id, status, lease_until, updated_at, last_error, attempts, max_attempts",
        )
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
        jobId: auditJob.id,
        jobStatus: auditJob.status as AuditQueueDiagnostics["jobStatus"],
        leaseUntil: auditJob.lease_until,
        jobUpdatedAt: auditJob.updated_at,
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
          typedCommunity?.facility_type ? (
            <span className="text-muted-foreground">
              {typedCommunity.facility_type}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PdfActions
              auditId={typedAudit.id}
              hasSavedPdf={Boolean(typedAudit.report_pdf_path)}
              generatedAt={typedAudit.report_generated_at}
              pdfExportAllowed={pdfExportAllowed}
              variant="row"
            />
            <DeleteAuditButton
              auditId={typedAudit.id}
              auditLabel={new Date(typedAudit.created_at).toLocaleString()}
              disabled={
                typedAudit.status === "pending" ||
                typedAudit.status === "running"
              }
            />
          </div>
        }
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
          cardDescription={EXPERT_CHECKLIST_CARD_DESCRIPTION}
          variant="collapsible"
        />
      ) : null}
    </>
  );
}
