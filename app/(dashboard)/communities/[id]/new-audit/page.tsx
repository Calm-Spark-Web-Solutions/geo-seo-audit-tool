import Link from "next/link";
import { notFound } from "next/navigation";
import { Gauge } from "lucide-react";

import { StartAuditForm } from "@/components/audits/StartAuditForm";
import { PageHeader } from "@/components/layout/PageHeader";
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
export const maxDuration = 60;

export default async function NewAuditPage({
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
          <CardTitle>New audit</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!community) notFound();

  const typed = community as Community;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={`/communities/${typed.id}`}
            className="hover:underline"
          >
            {typed.name}
          </Link>
        }
        title="Run new audit"
        description={
          <span className="text-muted-foreground">
            We&apos;ll crawl up to 10 pages (sitemap first, then same-site
            links), score each page with on-page checks, then show a full
            report. This usually takes under a minute.
          </span>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Gauge className="mt-1 h-5 w-5 text-muted-foreground" aria-hidden />
            <div>
              <CardTitle className="text-base">Confirm</CardTitle>
              <CardDescription className="pt-1">
                Target site:{" "}
                <a
                  href={typed.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {typed.website_url}
                </a>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StartAuditForm communityId={typed.id} />
        </CardContent>
      </Card>
    </>
  );
}
