import { ArrowLeft, ExternalLink, Lightbulb } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditPageRollupExclusion } from "@/components/audits/AuditPageRollupExclusion";
import { SeoGeoCheckTabs } from "@/components/audits/SeoGeoCheckTabs";
import { PageDiff } from "@/components/audits/PageDiff";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HOW_TO_READ_AUDIT } from "@/lib/audit/reader-copy";
import { checksCountingTowardScore } from "@/lib/scoring/effective-scores";
import { createClient } from "@/lib/supabase/server";
import type {
  Audit,
  AuditCheck,
  AuditPage,
  Community,
  FixItem,
  FixPriority,
} from "@/types";

type PriorPageSnapshot = {
  seo_results: AuditCheck[] | null;
  geo_results: AuditCheck[] | null;
};

export const dynamic = "force-dynamic";

const PRIORITY_ORDER: FixPriority[] = ["high", "medium", "low"];

const PRIORITY_TONE: Record<FixPriority, string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

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

  // Find the most recent prior completed audit on the same community and
  // pull this URL's snapshot so PageDiff can compute a proper delta.
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
  const seoForScore = checksCountingTowardScore(seo);
  const geoForScore = checksCountingTowardScore(geo);
  const seoTally = tallyChecks(seoForScore);
  const geoTally = tallyChecks(geoForScore);
  const totalChecks = seo.length + geo.length;

  const groupedFixes = PRIORITY_ORDER.map((priority) => ({
    priority,
    items: fixes.filter((f) => f.priority === priority),
  })).filter((g) => g.items.length > 0);

  const auditDate = new Date(typedAudit.created_at).toLocaleString();

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
        title={
          <span className="break-all">
            {typedPage.url}
          </span>
        }
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
            <span>·</span>
            <span>Audited {auditDate}</span>
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
            <Link href={`/audits/${typedAudit.id}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to audit
            </Link>
          </Button>
        }
      />

      <AuditPageRollupExclusion
        auditId={typedAudit.id}
        pageId={typedPage.id}
        excluded={typedPage.exclude_from_audit_score ?? false}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Page score"
          value={
            <>
              {typedPage.score ?? "—"}
              {typedPage.exclude_from_audit_score ? (
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Omitted from audit averages
                </span>
              ) : null}
            </>
          }
          emphasized
        />
        <StatCard
          label="SEO (search visibility)"
          value={
            seo.length === 0 ? (
              "—"
            ) : (
              <ResultTally tally={seoTally} />
            )
          }
        />
        <StatCard
          label="GEO (AI-ready)"
          value={
            geo.length === 0 ? (
              "—"
            ) : (
              <ResultTally tally={geoTally} />
            )
          }
        />
        <StatCard
          label="Suggested fixes"
          value={fixes.length}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How to read this page</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{HOW_TO_READ_AUDIT}</p>
        </CardContent>
      </Card>

      <PageDiff
        current={{ seo_results: seo, geo_results: geo }}
        prior={prior}
      />

      {typedPage.ai_comment ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI commentary</CardTitle>
            <CardDescription>
              Generated by the audit engine for this URL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {typedPage.ai_comment}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {totalChecks === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No checks recorded yet"
          description={
            typedAudit.status === "running" || typedAudit.status === "pending"
              ? "Checks will appear here as the audit engine finishes scoring this URL."
              : "This URL did not produce check results in this audit run."
          }
        />
      ) : (
        <SeoGeoCheckTabs
          seo={seo}
          geo={geo}
          seoTally={seoTally}
          geoTally={geoTally}
          auditId={typedAudit.id}
          pageId={typedPage.id}
        />
      )}

      {fixes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested fixes</CardTitle>
            <CardDescription>
              Prioritized recommendations to improve this page&rsquo;s SEO and GEO posture.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {groupedFixes.map((group) => (
              <div key={group.priority} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_TONE[group.priority]}`}
                  >
                    {group.priority} priority
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {group.items.length}{" "}
                    item{group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="flex flex-col gap-2 text-sm">
                  {group.items.map((fix, i) => (
                    <li
                      key={`${fix.title}-${i}`}
                      className="rounded-md border border-border bg-card px-3 py-2"
                    >
                      <p className="font-medium">{fix.title}</p>
                      <p className="text-muted-foreground">{fix.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function StatCard({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        emphasized
          ? "rounded-lg border border-border bg-muted/40 px-4 py-3"
          : "rounded-lg border border-border px-4 py-3"
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className={emphasized ? "mt-1 text-2xl font-semibold" : "mt-1 text-lg font-medium"}>
        {value}
      </div>
    </div>
  );
}

function ResultTally({
  tally,
}: {
  tally: { pass: number; warn: number; fail: number };
}) {
  return (
    <span className="flex items-baseline gap-2 tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">
        {tally.pass}
      </span>
      <span className="text-amber-600 dark:text-amber-400">{tally.warn}</span>
      <span className="text-destructive">{tally.fail}</span>
      <span className="text-xs font-normal text-muted-foreground">
        pass · warn · fail
      </span>
    </span>
  );
}
