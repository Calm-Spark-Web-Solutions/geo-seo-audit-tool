import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CompanyGoogleIntegrationsPanel } from "@/components/integrations/CompanyGoogleIntegrationsPanel";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getActiveOrgCookie } from "@/lib/active-org-cookie";
import { isGoogleOAuthConfigured } from "@/lib/integrations/google/config";
import { friendlyOAuthErrorForReason } from "@/lib/integrations/google/oauth-error-copy";
import { resolveDashboardOrgId } from "@/lib/layout/resolve-dashboard-org";
import { createClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function GoogleIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const orgParam = typeof sp.org === "string" ? sp.org : null;
  const googleFlash =
    typeof sp.google === "string"
      ? sp.google
      : Array.isArray(sp.google)
        ? sp.google[0]
        : undefined;
  const googleReason =
    typeof sp.reason === "string"
      ? sp.reason
      : Array.isArray(sp.reason)
        ? sp.reason[0]
        : undefined;
  const showGoogleConnectedFlash = googleFlash === "connected";
  const showGoogleErrorFlash = googleFlash === "error";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: companies }, cookieOrgId] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true }),
    getActiveOrgCookie(),
  ]);

  const companyList = (companies ?? []) as { id: string; name: string }[];
  if (companyList.length === 0) {
    return (
      <>
        <PageHeader
          title="Google Analytics & Search Console"
          description="Connect Google to show traffic alongside visibility scans."
        />
        <EmptyState
          icon={Building2}
          title="Create an organization first"
          description="Google connects per organization. Add one to link Search Console and Analytics."
          actions={
            <Button asChild>
              <Link href="/companies/new">Create organization</Link>
            </Button>
          }
        />
      </>
    );
  }

  const orgId = resolveDashboardOrgId(companyList, orgParam, cookieOrgId);
  if (!orgId) notFound();

  if (orgParam && orgParam !== orgId) {
    const q = new URLSearchParams();
    q.set("org", orgId);
    if (googleFlash) q.set("google", googleFlash);
    redirect(`/integrations/google?${q.toString()}`);
  }

  const activeCompany = companyList.find((c) => c.id === orgId);
  if (!activeCompany) notFound();

  const [
    { data: googleConn },
    { data: allCommunities },
    { data: memberRow },
  ] = await Promise.all([
    supabase
      .from("company_google_connections")
      .select("google_account_email, last_error")
      .eq("company_id", orgId)
      .maybeSingle(),
    supabase
      .from("communities")
      .select("id, name, website_url")
      .eq("company_id", orgId)
      .order("name", { ascending: true }),
    supabase
      .from("company_members")
      .select("role")
      .eq("company_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const role = memberRow?.role as string | undefined;
  if (!role) notFound();

  const communityIds = (allCommunities ?? []).map((c) => c.id as string);
  const { data: googlePropsRows } =
    communityIds.length > 0
      ? await supabase
          .from("community_google_properties")
          .select("community_id, gsc_site_url, ga4_property_id")
          .in("community_id", communityIds)
      : { data: [] };

  const googlePropsByCommunity = new Map(
    (googlePropsRows ?? []).map((r) => [
      r.community_id as string,
      {
        gsc_site_url: r.gsc_site_url as string | null,
        ga4_property_id: r.ga4_property_id as string | null,
      },
    ]),
  );

  const googleCommunityRows = (allCommunities ?? []).map((c) => {
    const props = googlePropsByCommunity.get(c.id as string);
    return {
      id: c.id as string,
      name: c.name as string,
      website_url: c.website_url as string,
      gsc_site_url: props?.gsc_site_url ?? null,
      ga4_property_id: props?.ga4_property_id ?? null,
    };
  });

  const canManage = role === "owner" || role === "admin";

  return (
    <>
      <PageHeader
        title="Google Analytics & Search Console"
        description={
          <>
            For{" "}
            <span className="font-medium text-foreground">
              {activeCompany.name}
            </span>
            . Connect once, then map each community website to the right
            properties.
          </>
        }
      />

      {showGoogleErrorFlash ? (
        <FriendlyOAuthErrorFlash reason={googleReason ?? null} />
      ) : null}

      {canManage ? (
        <CompanyGoogleIntegrationsPanel
          companyId={orgId}
          companyName={activeCompany.name}
          googleConnected={Boolean(googleConn)}
          googleAccountEmail={
            (googleConn?.google_account_email as string | null) ?? null
          }
          googleLastError={
            (googleConn?.last_error as string | null) ?? null
          }
          communities={googleCommunityRows}
          oauthConfigured={isGoogleOAuthConfigured()}
          showConnectedFlash={showGoogleConnectedFlash}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only organization owners and admins can connect Google. Ask an admin to
          complete setup, or open a community after mapping is done.
        </p>
      )}
    </>
  );
}

function FriendlyOAuthErrorFlash({ reason }: { reason: string | null }) {
  const friendly = friendlyOAuthErrorForReason(reason);
  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      <p className="font-medium">{friendly.title}</p>
      <p className="mt-0.5 text-destructive/90">{friendly.description}</p>
    </div>
  );
}
