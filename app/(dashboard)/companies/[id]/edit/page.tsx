import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyForm } from "@/components/companies/CompanyForm";
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
import type { Company } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select("id, user_id, name, logo_url, contact_name, contact_email, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <InlineErrorCard
        title="Could not load organization"
        description={error.message}
      />
    );
  }
  if (!company) notFound();

  const typedCompany = company as Company;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/companies/${id}`} className="hover:underline">
            {typedCompany.name}
          </Link>
        }
        title="Edit organization"
        actions={
          <Button variant="outline" asChild>
            <Link href={`/companies/${id}`}>Cancel</Link>
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organization details</CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyForm initial={typedCompany} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
