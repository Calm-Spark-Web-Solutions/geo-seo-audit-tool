import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { CompanyCard } from "@/components/companies/CompanyCard";
import { EmptyState } from "@/components/layout/EmptyState";
import { InlineErrorCard } from "@/components/layout/InlineErrorCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import type { Company } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, user_id, name, logo_url, contact_name, contact_email, created_at, communities(count)",
    )
    .order("name", { ascending: true });

  if (error) {
    return (
      <InlineErrorCard
        title="Could not load organizations"
        description={error.message}
      />
    );
  }

  type Row = Company & { communities: { count: number }[] };
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every organization is a group of communities you manage. Add an organization for each company you work with — handy if you run more than one brand or audit clients."
        actions={
          <Button asChild>
            <Link href="/companies/new">
              <Plus className="h-4 w-4" aria-hidden />
              New organization
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No organizations yet"
          description="Create your first organization, then add the community websites you want to track."
          actions={
            <Button asChild>
              <Link href="/companies/new">Create organization</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <CompanyCard
              key={row.id}
              company={row}
              communityCount={row.communities?.[0]?.count ?? 0}
            />
          ))}
        </div>
      )}
    </>
  );
}
