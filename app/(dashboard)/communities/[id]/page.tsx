import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Gauge } from "lucide-react";

import { StatusBadge } from "@/components/audits/StatusBadge";
import { DeleteCommunityButton } from "@/components/communities/DeleteCommunityButton";
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
import type { Audit, Community } from "@/types";

export const dynamic = "force-dynamic";

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: community, error }, { data: audits }] = await Promise.all([
    supabase
      .from("communities")
      .select("id, company_id, name, website_url, created_at, companies(id, name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("audits")
      .select(
        "id, community_id, status, score, seo_score, geo_score, pages_crawled, progress_total, created_at",
      )
      .eq("community_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Community</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!community) notFound();

  type CompanyRef = { id: string; name: string };
  type Row = Community & { companies: CompanyRef | CompanyRef[] | null };
  const typedCommunity = community as unknown as Row;
  const company = Array.isArray(typedCommunity.companies)
    ? typedCommunity.companies[0] ?? null
    : typedCommunity.companies;
  const typedAudits = (audits ?? []) as Audit[];

  return (
    <>
      <PageHeader
        eyebrow={
          company ? (
            <Link href={`/companies/${company.id}`} className="hover:underline">
              {company.name}
            </Link>
          ) : (
            "Community"
          )
        }
        title={typedCommunity.name}
        description={
          <a
            href={typedCommunity.website_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {typedCommunity.website_url}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        }
        actions={
          <>
            <Button asChild>
              <Link href={`/communities/${typedCommunity.id}/new-audit`}>
                Run new audit
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/communities/${typedCommunity.id}/edit`}>Edit</Link>
            </Button>
            <DeleteCommunityButton
              communityId={typedCommunity.id}
              communityName={typedCommunity.name}
            />
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Audit history</h2>
        {typedAudits.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No audits yet"
            description="Run the first audit to populate history and scores."
            actions={
              <Button asChild>
                <Link href={`/communities/${typedCommunity.id}/new-audit`}>
                  Run first audit
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {typedAudits.map((audit) => {
              const isFailed = audit.status === "failed";
              const isRunning =
                audit.status === "pending" || audit.status === "running";
              const total = audit.progress_total ?? 0;
              const detail = isRunning
                ? total > 0
                  ? `${audit.pages_crawled} / ${total} pages`
                  : "starting…"
                : audit.pages_crawled
                  ? `${audit.pages_crawled} page${audit.pages_crawled === 1 ? "" : "s"}`
                  : "no pages";

              return (
                <div
                  key={audit.id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <Link
                    href={`/audits/${audit.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <StatusBadge status={audit.status} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {new Date(audit.created_at).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {detail}
                      </span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-4 text-sm">
                    <Score label="SEO" value={audit.seo_score} />
                    <Score label="GEO" value={audit.geo_score} />
                    <Score label="Total" value={audit.score} bold />
                    {isFailed ? (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/communities/${typedCommunity.id}/new-audit`}>
                          Retry
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Score({ label, value, bold }: { label: string; value: number | null; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value ?? "—"}</span>
    </div>
  );
}
