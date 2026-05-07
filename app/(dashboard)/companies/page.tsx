import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { CompanyCard } from "@/components/companies/CompanyCard";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  type Row = Company & { communities: { count: number }[] };
  const rows = (data ?? []) as Row[];

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Operators and agencies you can manage."
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
          description="Create your first organization to start auditing communities."
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
