import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building, Plus, SearchX } from "lucide-react";

import { CommunityDirectorySearch } from "@/components/communities/CommunityDirectorySearch";
import { CommunityListPagination } from "@/components/communities/CommunityListPagination";
import { CommunityTable } from "@/components/communities/CommunityTable";
import { DeleteCompanyButton } from "@/components/companies/DeleteCompanyButton";
import { EmptyState } from "@/components/layout/EmptyState";
import { InlineErrorCard } from "@/components/layout/InlineErrorCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, initialsFor } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { normalizeCommunitySearch, stripLikeMetacharacters } from "@/lib/communities-list";
import { createClient } from "@/lib/supabase/server";
import type { Community, Company } from "@/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 48;

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const qRaw = typeof sp.q === "string" ? sp.q : "";
  const q = normalizeCommunitySearch(qRaw);
  const parsedPage =
    typeof sp.page === "string" ? Number.parseInt(sp.page, 10) : NaN;
  const pageRequested =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const supabase = await createClient();

  const [{ data: company, error: companyError }, { count: portfolioCount }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, user_id, name, logo_url, contact_name, contact_email, created_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("communities")
        .select("id", { count: "exact", head: true })
        .eq("company_id", id),
    ]);

  if (companyError) {
    return (
      <InlineErrorCard
        title="Could not load organization"
        description={companyError.message}
      />
    );
  }

  if (!company) notFound();

  const typedCompany = company as Company;

  let listQuery = supabase
    .from("communities")
    .select("id, company_id, name, website_url, facility_type, created_at", { count: "exact" })
    .eq("company_id", id)
    .order("name", { ascending: true });

  if (q.length > 0) {
    const safe = stripLikeMetacharacters(q);
    const pattern = `%${safe}%`;
    listQuery = listQuery.or(`name.ilike.${pattern},website_url.ilike.${pattern}`);
  }

  const totalPortfolio = portfolioCount ?? 0;
  const from = (pageRequested - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: rows, error: listError, count: matchCount } = await listQuery.range(
    from,
    to,
  );

  if (listError) {
    return (
      <InlineErrorCard
        title="Could not load communities"
        description={listError.message}
      />
    );
  }

  const filteredTotal =
    typeof matchCount === "number" ? matchCount : (rows ?? []).length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  if (pageRequested > totalPages) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (totalPages !== 1) p.set("page", String(totalPages));
    redirect(
      `/companies/${id}${p.toString() ? `?${p.toString()}` : ""}`,
    );
  }

  const page = pageRequested;
  const typedCommunities = (rows ?? []) as Community[];

  const latestAuditScores: Record<
    string,
    { score: number | null; seo_score: number | null; geo_score: number | null }
  > = {};

  if (typedCommunities.length > 0) {
    const communityIds = typedCommunities.map((c) => c.id);
    const { data: auditRows } = await supabase
      .from("audits")
      .select("community_id, score, seo_score, geo_score, created_at")
      .in("community_id", communityIds)
      .eq("status", "complete")
      .order("created_at", { ascending: false });

    if (auditRows && auditRows.length > 0) {
      const seen = new Set<string>();
      for (const row of auditRows) {
        const cid = row.community_id as string;
        if (seen.has(cid)) continue;
        seen.add(cid);
        latestAuditScores[cid] = {
          score: row.score as number | null,
          seo_score: row.seo_score as number | null,
          geo_score: row.geo_score as number | null,
        };
      }
    }
  }

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
              <a href={`mailto:${typedCompany.contact_email}`} className="hover:underline">
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

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Communities</h2>
            <p className="text-sm text-muted-foreground">
              {totalPortfolio === filteredTotal ? (
                <>
                  <span className="font-medium tabular-nums text-foreground">{totalPortfolio}</span>{" "}
                  {totalPortfolio === 1 ? "community" : "communities"}
                </>
              ) : (
                <>
                  <span className="font-medium tabular-nums text-foreground">{filteredTotal}</span>{" "}
                  matching
                  {" · "}
                  <span className="tabular-nums">{totalPortfolio}</span> total in this company
                </>
              )}
            </p>
          </div>
          <Button asChild>
            <Link href={`/companies/${typedCompany.id}/new-community`}>
              <Plus className="h-4 w-4" aria-hidden />
              Add community
            </Link>
          </Button>
        </div>

        {totalPortfolio >= 12 || q.length > 0 ? (
          <CommunityDirectorySearch companyId={typedCompany.id} query={q} />
        ) : null}

        {totalPortfolio === 0 ? (
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
        ) : filteredTotal === 0 && q.length > 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matches"
            description={
              <>
                No community name or URL matches &ldquo;
                <span className="font-medium text-foreground">{q}</span>&rdquo;.
                Try another search term.
              </>
            }
            actions={
              <Button variant="outline" asChild>
                <Link href={`/companies/${typedCompany.id}`}>Clear search</Link>
              </Button>
            }
          />
        ) : (
          <>
            <CommunityTable
              communities={typedCommunities}
              latestAuditScores={latestAuditScores}
            />
            <CommunityListPagination
              companyId={typedCompany.id}
              page={page}
              totalPages={totalPages}
              query={q}
            />
          </>
        )}
      </div>
    </>
  );
}
