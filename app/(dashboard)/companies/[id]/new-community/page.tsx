import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunityForm } from "@/components/communities/CommunityForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewCommunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!company) notFound();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/companies/${id}`} className="hover:underline">
            {company.name}
          </Link>
        }
        title="Add community"
        description="Each community has its own website and audit history."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/companies/${id}`}>Cancel</Link>
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Community details</CardTitle>
            <CardDescription>The website URL is used for crawling.</CardDescription>
          </CardHeader>
          <CardContent>
            <CommunityForm companyId={id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
