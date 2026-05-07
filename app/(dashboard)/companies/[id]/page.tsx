import Link from "next/link";
import { notFound } from "next/navigation";
import { Building, Plus } from "lucide-react";

import { CommunityCard } from "@/components/communities/CommunityCard";
import { DeleteCompanyButton } from "@/components/companies/DeleteCompanyButton";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, initialsFor } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Community, Company } from "@/types";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: company, error: companyError }, { data: communities }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, user_id, name, logo_url, contact_name, contact_email, created_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("communities")
        .select("id, company_id, name, website_url, created_at")
        .eq("company_id", id)
        .order("name", { ascending: true }),
    ]);

  if (companyError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>{companyError.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!company) notFound();

  const typedCompany = company as Company;
  const typedCommunities = (communities ?? []) as Community[];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/companies" className="hover:underline">
            Organizations
          </Link>
        }
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar
              src={typedCompany.logo_url}
              alt={typedCompany.name}
              fallback={initialsFor(typedCompany.name)}
              size="lg"
            />
            <span>{typedCompany.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap gap-3">
            {typedCompany.contact_name ? <span>{typedCompany.contact_name}</span> : null}
            {typedCompany.contact_email ? (
              <a
                href={`mailto:${typedCompany.contact_email}`}
                className="hover:underline"
              >
                {typedCompany.contact_email}
              </a>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/companies/${typedCompany.id}/edit`}>Edit</Link>
            </Button>
            <DeleteCompanyButton
              companyId={typedCompany.id}
              companyName={typedCompany.name}
            />
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Communities</h2>
          <Button asChild>
            <Link href={`/companies/${typedCompany.id}/new-community`}>
              <Plus className="h-4 w-4" aria-hidden />
              Add community
            </Link>
          </Button>
        </div>

        {typedCommunities.length === 0 ? (
          <EmptyState
            icon={Building}
            title="No communities yet"
            description="Add the first community website to begin running audits."
            actions={
              <Button asChild>
                <Link href={`/companies/${typedCompany.id}/new-community`}>
                  Add community
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {typedCommunities.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
