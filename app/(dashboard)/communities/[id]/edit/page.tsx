import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunityForm } from "@/components/communities/CommunityForm";
import { CommunityGooglePropertiesForm } from "@/components/integrations/CommunityGooglePropertiesForm";
import { InlineErrorCard } from "@/components/layout/InlineErrorCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Community } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditCommunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: community, error } = await supabase
    .from("communities")
    .select("id, company_id, name, website_url, facility_type, created_at")
    .eq("id", id)
    .maybeSingle();

  const companyId = community?.company_id as string | undefined;
  const [{ data: googleProps }, { data: googleConn }] = companyId
    ? await Promise.all([
        supabase
          .from("community_google_properties")
          .select("gsc_site_url, ga4_property_id")
          .eq("community_id", id)
          .maybeSingle(),
        supabase
          .from("company_google_connections")
          .select("company_id")
          .eq("company_id", companyId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  if (error) {
    return (
      <InlineErrorCard
        title="Could not load community"
        description={error.message}
      />
    );
  }
  if (!community) notFound();

  const typedCommunity = community as Community;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/communities/${id}`} className="hover:underline">
            {typedCommunity.name}
          </Link>
        }
        title="Edit community"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/communities/${id}`}>Cancel</Link>
          </Button>
        }
      />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Community details</CardTitle>
          </CardHeader>
          <CardContent>
            <CommunityForm initial={typedCommunity} />
          </CardContent>
        </Card>
        {companyId ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Google properties</CardTitle>
              <p className="text-sm text-muted-foreground">
                Map Search Console and GA4 for this community only. Other
                communities under the same organization can use different
                properties.
              </p>
            </CardHeader>
            <CardContent>
              <CommunityGooglePropertiesForm
                communityId={id}
                companyId={companyId}
                websiteUrl={typedCommunity.website_url}
                initialGscSiteUrl={
                  (googleProps?.gsc_site_url as string | null) ?? null
                }
                initialGa4PropertyId={
                  (googleProps?.ga4_property_id as string | null) ?? null
                }
                googleConnected={Boolean(googleConn)}
                companyHubHref={`/integrations/google?org=${companyId}`}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
