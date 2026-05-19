import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { googleMappingStatus } from "@/lib/integrations/google/google-properties-ui";
import { createClient } from "@/lib/supabase/server";
import type { CompanyRole } from "@/types";

function roleLabel(role: CompanyRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export async function SettingsOrganizationsSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await supabase
    .from("company_members")
    .select("company_id, role, companies(id, name)")
    .eq("user_id", user.id);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organizations</CardTitle>
          <CardDescription>
            Could not load organizations: {error.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  type CompanyEmbed = { id: string; name: string };
  type Row = {
    company_id: string;
    role: CompanyRole;
    companies: CompanyEmbed | CompanyEmbed[] | null;
  };

  function companyFromRow(r: Row): CompanyEmbed | null {
    const c = r.companies;
    if (!c) return null;
    return Array.isArray(c) ? (c[0] ?? null) : c;
  }

  const list = (rows ?? []) as unknown as Row[];
  const companyIds = list.map((r) => r.company_id);

  const { data: googleConnections } =
    companyIds.length > 0
      ? await supabase
          .from("company_google_connections")
          .select("company_id, google_account_email")
          .in("company_id", companyIds)
      : { data: [] };

  const { data: communityRows } =
    companyIds.length > 0
      ? await supabase
          .from("communities")
          .select("id, company_id")
          .in("company_id", companyIds)
      : { data: [] };

  const communityIds = (communityRows ?? []).map((c) => c.id as string);
  const { data: googlePropsRows } =
    communityIds.length > 0
      ? await supabase
          .from("community_google_properties")
          .select("community_id, gsc_site_url, ga4_property_id")
          .in("community_id", communityIds)
      : { data: [] };

  const propsByCommunity = new Map(
    (googlePropsRows ?? []).map((p) => [
      p.community_id as string,
      {
        gsc: p.gsc_site_url as string | null,
        ga4: p.ga4_property_id as string | null,
      },
    ]),
  );

  const googleByCompany = new Map<
    string,
    { connected: boolean; mapped: number; total: number }
  >();
  for (const cid of companyIds) {
    googleByCompany.set(cid, { connected: false, mapped: 0, total: 0 });
  }
  for (const conn of googleConnections ?? []) {
    const entry = googleByCompany.get(conn.company_id as string);
    if (entry) entry.connected = true;
  }
  for (const c of communityRows ?? []) {
    const companyId = c.company_id as string;
    const entry = googleByCompany.get(companyId);
    if (!entry) continue;
    entry.total += 1;
    const props = propsByCommunity.get(c.id as string);
    if (googleMappingStatus(props?.gsc, props?.ga4) === "mapped") {
      entry.mapped += 1;
    }
  }

  const orgs = list.map((r) => {
    const role = r.role as CompanyRole;
    const google = googleByCompany.get(r.company_id);
    return {
      id: r.company_id,
      name: companyFromRow(r)?.name ?? "Organization",
      role,
      canEdit: role === "owner" || role === "admin",
      googleConnected: google?.connected ?? false,
      googleMapped: google?.mapped ?? 0,
      googleTotal: google?.total ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Organizations</h2>
          <p className="text-sm text-muted-foreground">
            Quick links to organizations you belong to. For the full directory and
            filters, use the{" "}
            <Link
              href="/companies"
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Organizations
            </Link>{" "}
            page.
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/companies/new">Add organization</Link>
        </Button>
      </div>

      {orgs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No organizations yet</CardTitle>
            <CardDescription>
              Create an organization to manage communities and audits with your
              team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/companies/new">Create organization</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{o.name}</CardTitle>
                  <CardDescription>Your role: {roleLabel(o.role)}</CardDescription>
                  {o.canEdit ? (
                    <p className="text-sm text-muted-foreground">
                      Google:{" "}
                      {o.googleConnected ? (
                        <>
                          Connected
                          {o.googleTotal > 0 ? (
                            <>
                              {" · "}
                              <span className="tabular-nums">
                                {o.googleMapped}/{o.googleTotal}
                              </span>{" "}
                              mapped
                            </>
                          ) : null}
                          {" · "}
                          <a
                            href={`/companies/${o.id}#google-integrations`}
                            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                          >
                            Manage properties
                          </a>
                        </>
                      ) : (
                        <>
                          Not connected ·{" "}
                          <a
                            href={`/api/integrations/google/connect?company_id=${encodeURIComponent(o.id)}&return_to=${encodeURIComponent(`/companies/${o.id}`)}`}
                            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                          >
                            Connect Google
                          </a>
                        </>
                      )}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pt-0">
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/companies/${o.id}`}>Open organization</Link>
                  </Button>
                  {o.canEdit && o.googleConnected ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/companies/${o.id}#google-integrations`}>Google setup</a>
                    </Button>
                  ) : null}
                  {o.canEdit ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/companies/${o.id}/edit`}>Edit</Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
