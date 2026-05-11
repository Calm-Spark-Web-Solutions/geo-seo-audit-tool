import Link from "next/link";

import { BulkInvitePanel } from "@/components/teams/BulkInvitePanel";
import { CompanyTeamSection } from "@/components/teams/CompanyTeamSection";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export async function SettingsTeamInviteSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows, error } = await supabase
    .from("company_members")
    .select("company_id, role, companies(id, name)")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite teammates</CardTitle>
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
    role: string;
    companies: CompanyEmbed | CompanyEmbed[] | null;
  };

  function companyFromRow(r: Row): CompanyEmbed | null {
    const c = r.companies;
    if (!c) return null;
    return Array.isArray(c) ? (c[0] ?? null) : c;
  }

  const privileged = (rows ?? []) as unknown as Row[];
  const companies = privileged
    .map((r) => ({
      id: r.company_id,
      name: companyFromRow(r)?.name ?? "Organization",
    }))
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  if (companies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite teammates</CardTitle>
          <CardDescription>
            Invites can be sent from any organization where you are an{" "}
            <strong className="font-medium text-foreground">owner</strong> or{" "}
            <strong className="font-medium text-foreground">admin</strong>. If
            you only have member access, ask an admin to invite you or upgrade
            your role on the{" "}
            <Link
              href="/companies"
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              Organizations
            </Link>{" "}
            page.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Invite teammates</h2>
        <p className="text-sm text-muted-foreground">
          Add people to your organization with an email invite and shareable
          link. You can also manage the team from each{" "}
          <Link
            href="/companies"
            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            company page
          </Link>
          .
        </p>
      </div>
      <div className="flex flex-col gap-6">
        <BulkInvitePanel companies={companies} />
        {companies.map((c) => (
          <CompanyTeamSection
            key={c.id}
            companyId={c.id}
            organizationLabel={c.name}
          />
        ))}
      </div>
    </div>
  );
}
