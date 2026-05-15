"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, ChevronRight, Plus } from "lucide-react";

import { Avatar, initialsFor } from "@/components/ui/avatar";
import { selectedOrganizationId } from "@/lib/active-company";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

type CommunityRow = { id: string; name: string };

export function SidebarCompaniesList({
  companies,
  collapsed,
  activeOrganizationIdCookie,
  onNavigate,
}: {
  companies: Company[];
  collapsed: boolean;
  activeOrganizationIdCookie: string | null;
  onNavigate?: () => void;
}) {
  const params = useParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  const selectedCompanyId = selectedOrganizationId(
    companies,
    params,
    pathname,
    activeOrganizationIdCookie,
  );

  const [rows, setRows] = useState<CommunityRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCompanyId) return;

    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- loading placeholders before Supabase returns */
    setRows(null);
    setLoadError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    const supabase = createClient();
    void supabase
      .from("communities")
      .select("id, name")
      .eq("company_id", selectedCompanyId)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          setRows([]);
          return;
        }
        setRows((data ?? []) as CommunityRow[]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  const portfolioHref = selectedCompanyId
    ? `/companies/${selectedCompanyId}`
    : "/companies";
  const railActive =
    pathname.startsWith("/communities/") ||
    (selectedCompanyId !== null &&
      pathname.startsWith(`/companies/${selectedCompanyId}`));

  if (collapsed) {
    return (
      <div className="flex justify-center border-t border-border pt-4">
        <Link
          href={portfolioHref}
          title="Communities"
          onClick={onNavigate}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            railActive && "bg-accent text-accent-foreground",
          )}
        >
          <Building2 className="h-5 w-5 shrink-0" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden border-t border-border pt-4">
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Communities
        </p>
        {selectedCompanyId ? (
          <Link
            href={`/companies/${selectedCompanyId}/new-community`}
            onClick={onNavigate}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Add community"
            title="Add community"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <Link
            href="/companies/new"
            onClick={onNavigate}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Add organization"
            title="Add organization"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>

      {companies.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          <Link
            href="/companies/new"
            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            onClick={onNavigate}
          >
            Create an organization
          </Link>{" "}
          to get started.
        </p>
      ) : loadError ? (
        <p className="px-1 text-xs text-destructive" role="alert">
          {loadError}
        </p>
      ) : rows === null ? (
        <div className="space-y-2 px-1 py-1" aria-busy="true">
          <div className="h-9 animate-pulse rounded-md bg-muted/60" />
          <div className="h-9 animate-pulse rounded-md bg-muted/60" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          No communities yet.{" "}
          <Link
            href={`/companies/${selectedCompanyId}/new-community`}
            className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            onClick={onNavigate}
          >
            Add a community
          </Link>
          .
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {rows.map((c) => {
            const href = `/communities/${c.id}`;
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={c.id}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  title={c.name}
                  aria-label={`${c.name}, community`}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <Avatar
                    src={null}
                    alt={c.name}
                    fallback={initialsFor(c.name)}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 text-left text-sm leading-snug break-words line-clamp-2">
                    {c.name}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 opacity-40"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
