import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  Gauge,
  Globe2,
  Loader2,
  Plus,
} from "lucide-react";

import { StatTile } from "@/components/dashboard/StatTile";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AUDIT_RUNNING_EXPECTATION_SHORT } from "@/lib/audit/reader-copy";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RecentAudit {
  id: string;
  status: string;
  score: number | null;
  seo_score: number | null;
  geo_score: number | null;
  created_at: string;
  community_id: string;
  communities: { name: string; company_id: string } | { name: string; company_id: string }[] | null;
}

interface CompanyRow {
  id: string;
  name: string;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: companyListRaw, error: companiesError } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });

  const companies = (companyListRaw ?? []) as CompanyRow[];
  const orgCount = companies.length;

  if (companiesError) {
    console.warn("[dashboard] failed to load companies:", companiesError.message);
  }

  const companyIdsForNav = companies.slice(0, 2);
  const browseCommunitiesHref =
    companyIdsForNav.length === 1
      ? `/companies/${companyIdsForNav[0].id}`
      : "/companies";

  let communityCount: number | null = 0;
  let auditCount: number | null = 0;
  let scoreRows: { score: unknown }[] = [];
  let recentAudits: unknown[] | null = [];
  const communityCountsByCompany: Record<string, number> = {};
  let headerDescription: ReactNode;
  let communitiesHint: string;
  let auditsHint: string;
  let avgScoreHintBase: string;

  if (orgCount === 1) {
    const company = companies[0];
    const cid = company.id;

    const { data: idRows } = await supabase
      .from("communities")
      .select("id")
      .eq("company_id", cid);

    const commIds = ((idRows ?? []) as { id: string }[]).map((r) => r.id);
    communityCount = commIds.length;

    if (commIds.length === 0) {
      auditCount = 0;
      scoreRows = [];
      recentAudits = [];
    } else {
      const [{ count: audCount }, { data: scores }, { data: recent }] = await Promise.all([
        supabase
          .from("audits")
          .select("id", { count: "exact", head: true })
          .in("community_id", commIds),
        supabase
          .from("audits")
          .select("score")
          .in("community_id", commIds)
          .not("score", "is", null)
          .limit(200),
        supabase
          .from("audits")
          .select(
            "id, status, score, seo_score, geo_score, created_at, community_id, communities(name, company_id)",
          )
          .in("community_id", commIds)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      auditCount = audCount ?? 0;
      scoreRows = (scores ?? []) as { score: unknown }[];
      recentAudits = recent ?? [];
    }

    headerDescription = (
      <>
        Communities and visibility scans for{" "}
        <span className="font-medium text-foreground">{company.name}</span>.
      </>
    );
    communitiesHint = "In this company's portfolio";
    auditsHint = "Runs for communities in this company";
    avgScoreHintBase = "Scans tied to this company";
  } else if (orgCount > 1) {
    const [
      globalCommunity,
      globalAudits,
      globalScores,
      globalRecent,
      { data: commRows },
    ] = await Promise.all([
      supabase.from("communities").select("id", { count: "exact", head: true }),
      supabase.from("audits").select("id", { count: "exact", head: true }),
      supabase.from("audits").select("score").not("score", "is", null).limit(200),
      supabase
        .from("audits")
        .select(
          "id, status, score, seo_score, geo_score, created_at, community_id, communities(name, company_id)",
        )
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("communities").select("company_id"),
    ]);

    communityCount = globalCommunity.count ?? 0;
    auditCount = globalAudits.count ?? 0;
    scoreRows = (globalScores.data ?? []) as { score: unknown }[];
    recentAudits = globalRecent.data ?? [];

    for (const row of (commRows ?? []) as { company_id: string }[]) {
      const k = row.company_id;
      communityCountsByCompany[k] = (communityCountsByCompany[k] ?? 0) + 1;
    }

    headerDescription =
      "Communities and visibility scans across companies you operate or manage.";
    communitiesHint = "Across all companies";
    auditsHint = "All-time runs";
    avgScoreHintBase = "Across recent runs";
  } else {
    communityCount = 0;
    auditCount = 0;
    scoreRows = [];
    recentAudits = [];
    headerDescription = "Create a company profile to start adding communities.";
    communitiesHint = "Create a company to add communities";
    auditsHint = "No scans yet";
    avgScoreHintBase = "No scans yet";
  }

  const avgScore = (() => {
    const vals = scoreRows
      .map((r) => (r.score as number | null) ?? null)
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    const total = vals.reduce((acc, v) => acc + v, 0);
    return Math.round(total / vals.length);
  })();

  const audits = (recentAudits ?? []) as RecentAudit[];

  if (orgCount === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Welcome — let's set up your first company so you can run visibility scans on communities."
        />
        <EmptyState
          icon={Building2}
          title="Create your first company"
          description="A company groups the communities you manage. You can add team members and run visibility scans once it exists."
          actions={
            <Button asChild>
              <Link href="/companies/new">
                <Plus className="h-4 w-4" aria-hidden />
                Create company
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const showCommunityNudge =
    orgCount >= 1 && (communityCount ?? 0) === 0;
  const singleCompanyId = orgCount === 1 ? companies[0].id : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={headerDescription}
        eyebrow={orgCount === 1 ? <span>{companies[0].name}</span> : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={browseCommunitiesHref}>Browse communities</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/companies/new">
                <Plus className="h-4 w-4" aria-hidden />
                New company
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Building2}
          label="Companies"
          value={orgCount}
          hint={
            orgCount > 1
              ? "Switch between them in the sidebar"
              : orgCount === 1
                ? "Add communities from the company page"
                : "Create a company to add communities"
          }
        />
        <StatTile
          icon={Globe2}
          label="Communities"
          value={communityCount ?? 0}
          hint={communitiesHint}
        />
        <StatTile icon={Activity} label="Scans" value={auditCount ?? 0} hint={auditsHint} />
        <StatTile
          icon={Gauge}
          label="Avg score"
          value={avgScore ?? "—"}
          hint={avgScore == null ? "No scans yet" : avgScoreHintBase}
        />
      </div>

      {showCommunityNudge ? (
        <EmptyState
          icon={Globe2}
          title="Add your first community"
          description="Communities are the sites you scan. Add one to start running SEO and GEO checks."
          actions={
            singleCompanyId ? (
              <Button asChild>
                <Link href={`/companies/${singleCompanyId}/new-community`}>
                  <Plus className="h-4 w-4" aria-hidden />
                  New community
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/companies">Pick a company</Link>
              </Button>
            )
          }
        />
      ) : null}

      {orgCount > 1 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Companies</CardTitle>
            <CardDescription>Open a company to browse or search communities.</CardDescription>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {companies.map((c) => {
              const count = communityCountsByCompany[c.id] ?? 0;
              const label = count === 1 ? "1 community" : `${count} communities`;
              return (
                <li key={c.id}>
                  <Link
                    href={`/companies/${c.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {label}
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent visibility scans</h2>
          <Link
            href={browseCommunitiesHref}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Communities
          </Link>
        </div>
        {audits.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No scans yet"
            description="Run your first visibility scan from a community page to see it appear here."
            actions={
              <Button asChild>
                <Link href={browseCommunitiesHref}>Pick a community</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <ul className="flex flex-col divide-y divide-border">
              {audits.map((a) => {
                const community = Array.isArray(a.communities)
                  ? a.communities[0]
                  : a.communities;
                const auditRunning =
                  a.status === "pending" || a.status === "running";
                return (
                  <li key={a.id}>
                    <Link
                      href={`/visibility-scans/${a.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-accent"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {community?.name ?? "Unknown community"}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{new Date(a.created_at).toLocaleString()}</span>
                          <span aria-hidden>·</span>
                          {auditRunning ? (
                            <>
                              <Loader2
                                className="h-3 w-3 shrink-0 animate-spin"
                                aria-hidden
                              />
                              <span className="capitalize">{a.status}</span>
                            </>
                          ) : (
                            <span className="capitalize">{a.status}</span>
                          )}
                        </span>
                        {auditRunning ? (
                          <span className="text-xs leading-snug text-muted-foreground">
                            {AUDIT_RUNNING_EXPECTATION_SHORT}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <ScoreCell label="SEO" value={a.seo_score} />
                        <ScoreCell label="GEO" value={a.geo_score} />
                        <ScoreCell label="Total" value={a.score} bold />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick actions</CardTitle>
          <CardDescription>Common tasks to keep visibility scans flowing.</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2 px-6 pb-6">
          <Button asChild>
            <Link href={browseCommunitiesHref}>Browse communities</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/companies/new">
              <Plus className="h-4 w-4" aria-hidden />
              New company
            </Link>
          </Button>
        </div>
      </Card>
    </>
  );
}

function ScoreCell({
  label,
  value,
  bold,
}: {
  label: string;
  value: number | null;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value ?? "—"}</span>
    </div>
  );
}
