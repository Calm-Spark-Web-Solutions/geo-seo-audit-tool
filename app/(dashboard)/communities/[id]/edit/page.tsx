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
    .select("id, company_id, name, website_url, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Edit community</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
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
      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Community details</CardTitle>
          </CardHeader>
          <CardContent>
            <CommunityForm initial={typedCommunity} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
