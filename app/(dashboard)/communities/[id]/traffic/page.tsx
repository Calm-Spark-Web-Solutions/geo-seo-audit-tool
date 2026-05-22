import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, LineChart } from "lucide-react";

import { GoogleMetricsCard } from "@/components/communities/GoogleMetricsCard";
import { RefreshGoogleMetricsButton } from "@/components/communities/RefreshGoogleMetricsButton";
import { AiAssistantTrafficCard } from "@/components/integrations/AiAssistantTrafficCard";
import { SearchQueriesTable } from "@/components/integrations/SearchQueriesTable";
import { TopPagesTable } from "@/components/integrations/TopPagesTable";
import { EmptyState } from "@/components/layout/EmptyState";
import { InlineErrorCard } from "@/components/layout/InlineErrorCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type {
  Community,
  CommunityGoogleMetricsSnapshot,
} from "@/types";

export const dynamic = "force-dynamic";

export default async function CommunityTrafficPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: community, error },
    { data: latestSnapshotRow },
    { data: googleProps },
  ] = await Promise.all([
    supabase
      .from("communities")
      .select(
        "id, company_id, name, website_url, facility_type, created_at, companies(id, name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("community_google_metrics_snapshots")
      .select(
        "community_id, snapshot_date, gsc_clicks_28d, gsc_impressions_28d, ga4_sessions_28d, ga4_active_users_28d, gsc_top_queries, gsc_top_pages, ga4_ai_referrals, source, audit_id",
      )
      .eq("community_id", id)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("community_google_properties")
      .select("gsc_site_url, ga4_property_id")
      .eq("community_id", id)
      .maybeSingle(),
  ]);

  if (error) {
    return (
      <InlineErrorCard
        title="Could not load community"
        description={error.message}
      />
    );
  }

  if (!community) notFound();

  type CompanyRef = { id: string; name: string };
  type Row = Community & {
    companies: CompanyRef | CompanyRef[] | null;
  };
  const typedCommunity = community as unknown as Row;
  const companyRel = Array.isArray(typedCommunity.companies)
    ? typedCommunity.companies[0] ?? null
    : typedCommunity.companies;

  const latestMetrics =
    (latestSnapshotRow as CommunityGoogleMetricsSnapshot | null) ?? null;

  const googleMapped = {
    gsc: Boolean(googleProps?.gsc_site_url?.trim()),
    ga4: Boolean(googleProps?.ga4_property_id?.trim()),
  };
  const anyMapped = googleMapped.gsc || googleMapped.ga4;

  // Org-level Google OAuth connection lets us surface a targeted CTA when
  // the org has connected Google but this community hasn't been mapped yet.
  const { data: googleConn } = await supabase
    .from("company_google_connections")
    .select("company_id")
    .eq("company_id", typedCommunity.company_id)
    .maybeSingle();
  const orgHasGoogle = Boolean(googleConn);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/communities/${typedCommunity.id}`}
            className="hover:underline"
          >
            {typedCommunity.name}
          </Link>
        }
        title="Google traffic"
        description={
          <span className="flex flex-col gap-1">
            <span>
              How this community is performing on Google Search and which AI
              assistants are sending visitors. Numbers cover the last 28 days.
            </span>
            <a
              href={typedCommunity.website_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm hover:underline"
            >
              {typedCommunity.website_url}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </span>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/communities/${typedCommunity.id}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to community
            </Link>
          </Button>
        }
      />

      {!anyMapped ? (
        <EmptyState
          icon={LineChart}
          title={
            orgHasGoogle
              ? "Google is connected — finish mapping this community"
              : "Connect Google to see traffic data"
          }
          description={
            orgHasGoogle
              ? "Pick a Search Console site and Analytics property for this community on the Google setup page. Once mapped, the next daily sync (or refresh) populates this page."
              : "Connect Google Search Console and Google Analytics for this organization to surface 28-day clicks, top queries, top pages, and AI assistant referrals here."
          }
          actions={
            companyRel ? (
              <Button asChild>
                <Link
                  href={`/integrations/google?org=${encodeURIComponent(companyRel.id)}`}
                >
                  {orgHasGoogle ? "Map properties" : "Connect Google"}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <GoogleMetricsCard metrics={latestMetrics} mapped={googleMapped} />
          <RefreshGoogleMetricsButton
            communityId={id}
            googleSetupHref={
              companyRel
                ? `/integrations/google?org=${encodeURIComponent(companyRel.id)}`
                : undefined
            }
          />
          {!latestMetrics ? (
            <p className="text-xs text-muted-foreground">
              Data can take a minute after mapping. Use refresh above if numbers
              do not appear.
            </p>
          ) : null}

          {latestMetrics && googleMapped.gsc ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <SearchQueriesTable rows={latestMetrics.gsc_top_queries ?? null} />
              <TopPagesTable rows={latestMetrics.gsc_top_pages ?? null} />
            </div>
          ) : null}

          {latestMetrics && googleMapped.ga4 ? (
            <AiAssistantTrafficCard
              referrals={latestMetrics.ga4_ai_referrals ?? null}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
