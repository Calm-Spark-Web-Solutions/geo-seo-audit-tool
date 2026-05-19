import Link from "next/link";
import type { ReactNode } from "react";
import { Building2, Globe2, LayoutGrid, Plus } from "lucide-react";

import { CommunitiesLeaderboard } from "@/components/dashboard/CommunitiesLeaderboard";
import type { CommunityLeaderRow } from "@/components/dashboard/CommunitiesLeaderboard";
import { HeroBand } from "@/components/dashboard/HeroBand";
import { RecentScansTable } from "@/components/dashboard/RecentScansTable";
import type { RecentScanRow } from "@/components/dashboard/RecentScansTable";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getActiveOrgCookie } from "@/lib/active-org-cookie";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyRow { id: string; name: string }
interface CommunityRow { id: string; name: string; company_id: string }
interface AuditRow {
  id: string;
  status: string;
  score: number | null;
  seo_score: number | null;
  geo_score: number | null;
  created_at: string;
  community_id: string;
  communities:
    | { name: string; company_id: string }
    | { name: string; company_id: string }[]
    | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeAvg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((s, v) => s + v, 0) / nums.length);
}

function buildLeaderboardRows(
  communities: CommunityRow[],
  audits: AuditRow[],
  companyNameById: Map<string, string>,
): CommunityLeaderRow[] {
  return communities.map((comm) => {
    const commAudits = audits
      .filter((a) => a.community_id === comm.id && a.status === "complete")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const latest = commAudits[0] ?? null;
    const spark = commAudits
      .slice(0, 8)
      .map((a) => a.score)
      .filter((v): v is number => v != null)
      .reverse();

    return {
      communityId: comm.id,
      latestScanId: latest?.id ?? null,
      name: comm.name,
      companyName: companyNameById.get(comm.company_id) ?? null,
      lastScanAt: latest?.created_at ?? null,
      latestScore: latest?.score ?? null,
      latestSeo: latest?.seo_score ?? null,
      latestGeo: latest?.geo_score ?? null,
      spark,
    };
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const orgParam = typeof sp.org === "string" ? sp.org : null;
  const supabase = await createClient();

  const { data: companyListRaw } = await supabase
    .from("companies")
    .select("id, name")
    .order("name", { ascending: true });
  const allCompanies = (companyListRaw ?? []) as CompanyRow[];
  const orgCount = allCompanies.length;

  if (orgCount === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Welcome — let's set up your first company so you can run visibility scans."
        />
        <EmptyState
          icon={Building2}
          title="Create your first company"
          description="A company groups the communities you manage. Add one to start running SEO and GEO checks."
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

  const companyNameById = new Map(allCompanies.map((c) => [c.id, c.name]));

  // ── Active org resolution (priority: URL param → cookie → first company) ──
  // The sidebar embeds ?org=<id> in the Dashboard link so URL param is always
  // the authoritative signal. Cookie is a fallback for direct /dashboard visits.
  const cookieOrgId = await getActiveOrgCookie();
  const resolvedOrgId = orgParam ?? cookieOrgId;
  const activeCompany =
    (resolvedOrgId && allCompanies.find((c) => c.id === resolvedOrgId)) ||
    allCompanies[0];

  // ── Communities for active org ────────────────────────────────────────────
  const { data: commRaw } = await supabase
    .from("communities")
    .select("id, name, company_id")
    .eq("company_id", activeCompany.id)
    .order("name", { ascending: true });
  const communities = (commRaw ?? []) as CommunityRow[];
  const communityCount = communities.length;
  const commIds = communities.map((c) => c.id);

  // ── Audits (150 newest for this org) ─────────────────────────────────────
  let recentAudits: AuditRow[] = [];
  if (commIds.length > 0) {
    const { data: audRaw } = await supabase
      .from("audits")
      .select(
        "id, status, score, seo_score, geo_score, created_at, community_id, communities(name, company_id)",
      )
      .in("community_id", commIds)
      .order("created_at", { ascending: false })
      .limit(150);
    recentAudits = (audRaw ?? []) as AuditRow[];
  }

  // ── Exact all-time count ──────────────────────────────────────────────────
  let exactAuditCount = 0;
  if (commIds.length > 0) {
    const { count } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .in("community_id", commIds);
    exactAuditCount = count ?? 0;
  }

  // ── Scans this month ──────────────────────────────────────────────────────
  let scansThisMonth = 0;
  if (commIds.length > 0) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("audits")
      .select("id", { count: "exact", head: true })
      .in("community_id", commIds)
      .gte("created_at", monthStart.toISOString());
    scansThisMonth = count ?? 0;
  }

  // ── Score aggregations ────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/purity -- async Server Component; snapshot once per request for 30d windows
  const now = Date.now();
  const ms30d = 30 * 24 * 60 * 60 * 1000;

  const completed = recentAudits.filter((a) => a.status === "complete");

  // Current 30d window
  const recent30 = completed.filter(
    (a) => now - new Date(a.created_at).getTime() < ms30d,
  );
  // Prior 30d window (30-60 days ago)
  const prior30 = completed.filter((a) => {
    const age = now - new Date(a.created_at).getTime();
    return age >= ms30d && age < 2 * ms30d;
  });

  const recentScores = recent30.map((a) => a.score).filter((v): v is number => v != null);
  const priorScores  = prior30.map((a) => a.score).filter((v): v is number => v != null);

  // Fall back to all completed scores when the recent window is empty
  const allCompleteScores = completed.map((a) => a.score).filter((v): v is number => v != null);
  const avgScore = computeAvg(recentScores.length ? recentScores : allCompleteScores);
  const avgSeo = computeAvg(
    (recentScores.length ? recent30 : completed)
      .map((a) => a.seo_score).filter((v): v is number => v != null),
  );
  const avgGeo = computeAvg(
    (recentScores.length ? recent30 : completed)
      .map((a) => a.geo_score).filter((v): v is number => v != null),
  );

  const priorAvg = computeAvg(priorScores);
  const scoreDelta =
    avgScore != null && priorAvg != null ? avgScore - priorAvg : 0;

  // ── Trend lines — use up to 8 completed audits, oldest→newest ─────────────
  // Each point represents a distinct scan in history (not necessarily weekly).
  const trendAudits = completed.slice(0, 8).reverse();
  const trendSeo = trendAudits.map((a) => a.seo_score).filter((v): v is number => v != null);
  const trendGeo = trendAudits.map((a) => a.geo_score).filter((v): v is number => v != null);

  // ── Leaderboard rows ──────────────────────────────────────────────────────
  const leaderboardRows = buildLeaderboardRows(communities, recentAudits, companyNameById);

  // ── Recent scans table rows ───────────────────────────────────────────────
  const recentScanRows: RecentScanRow[] = recentAudits.slice(0, 8).map((a) => {
    const comm = Array.isArray(a.communities) ? a.communities[0] : a.communities;
    return {
      id: a.id,
      communityName: comm?.name ?? "Unknown community",
      companyName: null,
      when: a.created_at,
      seo: a.seo_score,
      geo: a.geo_score,
      total: a.score,
      status: a.status,
    };
  });

  const showCommunityNudge = communityCount === 0;

  const headerDescription: ReactNode = (
    <>
      How your{" "}
      <Link
        href={`/companies/${activeCompany.id}`}
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {activeCompany.name}
      </Link>{" "}
      portfolio shows up across Google and AI assistants.
    </>
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={headerDescription}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {orgCount > 1 && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/companies" className="flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                  All organizations
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/companies/${activeCompany.id}`}>
                Browse communities
              </Link>
            </Button>
          </div>
        }
      />

      {showCommunityNudge ? (
        <EmptyState
          icon={Globe2}
          title="Add your first community"
          description="Communities are the sites you scan. Add one to start running SEO and GEO checks."
          actions={
            <Button asChild>
              <Link href={`/companies/${activeCompany.id}/new-community`}>
                <Plus className="h-4 w-4" aria-hidden />
                New community
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* ── Hero band: score ring + trend chart + KPI strip ─────── */}
          <HeroBand
            score={avgScore}
            delta={scoreDelta}
            avgSeo={avgSeo}
            avgGeo={avgGeo}
            trendSeo={trendSeo}
            trendGeo={trendGeo}
            communityCount={communityCount}
            totalScans={exactAuditCount}
            scansThisMonth={scansThisMonth}
          />

          {/* ── Communities leaderboard ──────────────────────────────── */}
          <CommunitiesLeaderboard
            rows={leaderboardRows}
            showCompany={false}
            footer={
              orgCount > 1 ? (
                <div className="flex items-center justify-between border-t border-border px-6 py-3 text-xs text-muted-foreground">
                  <span>
                    Showing communities for{" "}
                    <span className="font-medium text-foreground">
                      {activeCompany.name}
                    </span>
                  </span>
                  <Link
                    href="/companies"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    View all organizations →
                  </Link>
                </div>
              ) : null
            }
          />

          {/* ── Recent scans ─────────────────────────────────────────── */}
          <RecentScansTable rows={recentScanRows} showViewAll={false} />
        </>
      )}
    </>
  );
}
