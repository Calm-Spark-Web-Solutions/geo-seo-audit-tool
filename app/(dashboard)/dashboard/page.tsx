import Link from "next/link";
import { Activity, Building2, Gauge, Globe2, Plus } from "lucide-react";

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: orgCount },
    { count: communityCount },
    { count: auditCount },
    { data: scoreRows },
    { data: recentAudits },
  ] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
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
  ]);

  const avgScore = (() => {
    const vals = (scoreRows ?? [])
      .map((r) => (r.score as number | null) ?? null)
      .filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    const total = vals.reduce((acc, v) => acc + v, 0);
    return Math.round(total / vals.length);
  })();

  const audits = (recentAudits ?? []) as RecentAudit[];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="High-level view across all your organizations."
        actions={
          <Button asChild>
            <Link href="/companies/new">
              <Plus className="h-4 w-4" aria-hidden />
              New organization
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Building2}
          label="Organizations"
          value={orgCount ?? 0}
          hint="Total you can access"
        />
        <StatTile
          icon={Globe2}
          label="Communities"
          value={communityCount ?? 0}
          hint="Across all organizations"
        />
        <StatTile
          icon={Activity}
          label="Audits"
          value={auditCount ?? 0}
          hint="All-time runs"
        />
        <StatTile
          icon={Gauge}
          label="Avg score"
          value={avgScore ?? "—"}
          hint={avgScore == null ? "No audits yet" : "Across recent runs"}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent audits</h2>
          <Link
            href="/companies"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            All organizations
          </Link>
        </div>
        {audits.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No audits yet"
            description="Run your first audit from a community page to see it appear here."
            actions={
              <Button asChild>
                <Link href="/companies">Pick a community</Link>
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
                return (
                  <li key={a.id}>
                    <Link
                      href={`/audits/${a.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-accent"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {community?.name ?? "Unknown community"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()} · {a.status}
                        </span>
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
          <CardDescription>Common tasks to keep audits flowing.</CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2 px-6 pb-6">
          <Button asChild>
            <Link href="/companies/new">New organization</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/companies">Browse organizations</Link>
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
