import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const orgs = list.map((r) => {
    const role = r.role as CompanyRole;
    return {
      id: r.company_id,
      name: companyFromRow(r)?.name ?? "Organization",
      role,
      canEdit: role === "owner" || role === "admin",
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
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2 pt-0">
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/companies/${o.id}`}>Open</Link>
                  </Button>
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
