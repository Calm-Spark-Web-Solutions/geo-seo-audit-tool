import {
  ArrowLeft,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  Tag,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AiCommentaryCard } from "@/components/audits/AiCommentaryCard";
import { AuditPageRollupExclusion } from "@/components/audits/AuditPageRollupExclusion";
import { ChecksCategoryBreakdown } from "@/components/audits/ChecksCategoryBreakdown";
import type { CategoryStat } from "@/components/audits/ChecksCategoryBreakdown";
import { FixesList } from "@/components/audits/FixesList";
import { HowToReadDismissible } from "@/components/audits/HowToReadDismissible";
import { LighthouseSection } from "@/components/audits/LighthouseSection";
import { PageDetailNav } from "@/components/audits/PageDetailNav";
import { PageDetailStatBar } from "@/components/audits/PageDetailStatBar";
import { PageDiff } from "@/components/audits/PageDiff";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { findInspectorEvidence } from "@/lib/audit/inspector";
import { checksCountingTowardScore } from "@/lib/scoring/effective-scores";
import { createClient } from "@/lib/supabase/server";
import type {
  Audit,
  AuditCheck,
  AuditPage,
  Community,
  FixItem,
} from "@/types";

type PriorPageSnapshot = {
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
};

export const dynamic = "force-dynamic";

function tallyChecks(checks: AuditCheck[]): {
  pass: number;
  warn: number;
  fail: number;
} {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of checks) {
    if (c.result === "pass") pass += 1;
    else if (c.result === "warn") warn += 1;
    else fail += 1;
  }
  return { pass, warn, fail };
}

function buildCategoryStats(checks: AuditCheck[]): CategoryStat[] {
  const map = new Map<
    string,
    { scoreSum: number; pass: number; warn: number; fail: number; count: number }
  >();
  for (const c of checks) {
    const cat = c.category?.trim() || "General";
    const entry = map.get(cat) ?? {
      scoreSum: 0,
      pass: 0,
      warn: 0,
      fail: 0,
      count: 0,
    };
    const s =
      typeof c.score === "number"
        ? c.score
        : c.result === "pass"
          ? 100
          : c.result === "warn"
            ? 50
            : 0;
    entry.scoreSum += s;
    entry.count += 1;
    if (c.result === "pass") entry.pass += 1;
    else if (c.result === "warn") entry.warn += 1;
    else entry.fail += 1;
    map.set(cat, entry);
  }
  return [...map.entries()]
    .map(([category, e]) => ({
      category,
      avgScore: Math.round(e.scoreSum / e.count),
      pass: e.pass,
      warn: e.warn,
      fail: e.fail,
      total: e.count,
    }))
    .sort((a, b) => a.avgScore - b.avgScore); // worst first so users see priorities
}

export default async function AuditPageDetailPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id: auditId, pageId } = await params;
  const supabase = await createClient();

  const [{ data: audit }, { data: page }] = await Promise.all([
    supabase
      .from("audits")
      .select(
        "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, created_at",
      )
      .eq("id", auditId)
      .maybeSingle(),
    supabase
      .from("audit_pages")
      .select(
        "id, audit_id, url, score, seo_results, geo_results, fixes, manual_notes, ai_comment, exclude_from_audit_score, created_at",
      )
      .eq("id", pageId)
      .eq("audit_id", auditId)
      .maybeSingle(),
  ]);

  if (!audit || !page) notFound();

  const typedAudit = audit as Audit;
  const typedPage = page as AuditPage;

  const { data: community } = await supabase
    .from("communities")
    .select("id, name, facility_type")
    .eq("id", typedAudit.community_id)
    .maybeSingle();
  const typedCommunity = community as
    | Pick<Community, "id" | "name" | "facility_type">
    | null;

  let prior: PriorPageSnapshot | undefined;
  const { data: priorAudit } = await supabase
    .from("audits")
    .select("id")
    .eq("community_id", typedAudit.community_id)
    .eq("status", "complete")
    .lt("created_at", typedAudit.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priorAudit?.id) {
    const { data: priorPage } = await supabase
      .from("audit_pages")
      .select("seo_results, geo_results")
      .eq("audit_id", priorAudit.id)
      .eq("url", typedPage.url)
      .maybeSingle();
    if (priorPage) {
      prior = {
        seo_results: (priorPage.seo_results ?? null) as AuditCheck[] | null,
        geo_results: (priorPage.geo_results ?? null) as AuditCheck[] | null,
      };
    }
  }

  const seo = (typedPage.seo_results ?? []) as AuditCheck[];
  const geo = (typedPage.geo_results ?? []) as AuditCheck[];
  const fixes = (typedPage.fixes ?? []) as FixItem[];
  const allChecks = [...seo, ...geo];
  const seoForScore = checksCountingTowardScore(seo);
  const geoForScore = checksCountingTowardScore(geo);
  const seoTally = tallyChecks(seoForScore);
  const geoTally = tallyChecks(geoForScore);

  const categoryStats = buildCategoryStats(allChecks);

  const auditDate = new Date(typedAudit.created_at).toLocaleString();
  const basePath = `/visibility-scans/${auditId}/pages/${pageId}`;

  const linksEvidence = findInspectorEvidence(allChecks, "links", [
    "internal_links",
  ]);
  const imagesEvidence = findInspectorEvidence(allChecks, "images", [
    "img_alt",
  ]);
  const schemaEvidence = findInspectorEvidence(allChecks, "schema", [
    "structured_data_coverage",
  ]);

  const inspectorCards = [
    linksEvidence
      ? {
          icon: LinkIcon,
          label: "Internal links",
          value: linksEvidence.evidence.totalCount ?? 0,
          suffix: "captured",
          href: `${basePath}/inspectors/links`,
        }
      : null,
    imagesEvidence
      ? {
          icon: ImageIcon,
          label: "Images missing alt",
          value: imagesEvidence.evidence.totalCount ?? 0,
          suffix: "found",
          href: `${basePath}/inspectors/images`,
        }
      : null,
    schemaEvidence
      ? {
          icon: Tag,
          label: "Schema @types",
          value: schemaEvidence.evidence.totalCount ?? 0,
          suffix: "detected",
          href: `${basePath}/inspectors/schema`,
        }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  const highPriorityFixes = fixes.filter((f) => f.priority === "high");

  return (
    <>
      <PageDetailNav auditId={auditId} pageId={pageId} />

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
        title={<span className="break-all">{typedPage.url}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <a
              href={typedPage.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Open page in new tab
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            {typedCommunity?.facility_type ? (
              <>
                <span aria-hidden>·</span>
                <span className="text-muted-foreground">
                  {typedCommunity.facility_type}
                </span>
              </>
            ) : null}
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/visibility-scans/${typedAudit.id}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to audit
            </Link>
          </Button>
        }
      />

      {/* Score hero — visual-first summary */}
      <PageDetailStatBar
        score={typedPage.score}
        excluded={typedPage.exclude_from_audit_score ?? false}
        seoTally={seoTally}
        geoTally={geoTally}
        fixCount={fixes.length}
        auditedAt={auditDate}
      />

      <HowToReadDismissible />

      {/* What changed vs the previous scan */}
      <PageDiff
        current={{ seo_results: seo, geo_results: geo }}
        prior={prior}
      />

      {/* AI-generated page analysis */}
      {typedPage.ai_comment ? (
        <AiCommentaryCard comment={typedPage.ai_comment} />
      ) : null}

      {/* Category breakdown — replaces the old pillar summary */}
      <ChecksCategoryBreakdown
        categories={categoryStats}
        checksHref={`${basePath}/checks`}
      />

      {/* Top priority fixes */}
      {fixes.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden />
                Top priority fixes
              </CardTitle>
              <CardDescription>
                {highPriorityFixes.length > 0
                  ? `${highPriorityFixes.length} high-priority recommendation${highPriorityFixes.length === 1 ? "" : "s"} for this page.`
                  : `${fixes.length} recommendation${fixes.length === 1 ? "" : "s"} for this page.`}
              </CardDescription>
            </div>
            <Link
              href={`${basePath}/fixes`}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <FixesList
              fixes={highPriorityFixes.length > 0 ? highPriorityFixes : fixes}
              limit={3}
            />
          </CardContent>
        </Card>
      ) : null}

      <LighthouseSection
        checks={allChecks}
        variant="summary"
        detailsHref={`${basePath}/inspectors/lighthouse`}
        pageRefresh={{ auditId, pageId }}
      />

      {/* Inspector quick-links */}
      {inspectorCards.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {inspectorCards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:border-foreground/30"
            >
              <c.icon
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {c.value}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {c.suffix}
                  </span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {/* Rollup exclusion — admin detail, moved to bottom */}
      <AuditPageRollupExclusion
        auditId={typedAudit.id}
        pageId={typedPage.id}
        excluded={typedPage.exclude_from_audit_score ?? false}
      />
    </>
  );
}
