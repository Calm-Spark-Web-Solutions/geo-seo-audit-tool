"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { Avatar, initialsFor } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

interface Props {
  companies: Company[];
}

export function CompanySwitcher({ companies }: Props) {
  const params = useParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  const activeId = resolveActiveId(params, pathname);

  const sectionTitle =
    companies.length <= 1 ? "Company" : "Organizations";

  const sectionHint =
    companies.length > 1 ? (
      <p className="text-xs text-muted-foreground">
        Switch when you audit or manage multiple companies.
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="space-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {sectionTitle}
        </p>
        {sectionHint}
      </div>
      {companies.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Create a company profile to add communities.{" "}
          <Link href="/companies/new" className="underline">
            Get started
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {companies.map((company) => {
              const isActive = company.id === activeId;
              return (
                <li key={company.id}>
                  <Link
                    href={`/companies/${company.id}`}
                    className={cn(
                      "flex items-center gap-2 truncate rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    title={company.name}
                  >
                    <Avatar
                      src={company.logo_url}
                      alt={company.name}
                      fallback={initialsFor(company.name)}
                      size="sm"
                    />
                    <span className="truncate">{company.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {companies.length > 1 ? (
            <Link
              href="/companies"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Manage all organizations
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}

function resolveActiveId(
  params: { id?: string | string[] },
  pathname: string,
): string | null {
  if (!pathname.startsWith("/companies/")) return null;
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}
