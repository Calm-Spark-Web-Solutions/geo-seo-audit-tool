"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";

import { Avatar, initialsFor } from "@/components/ui/avatar";
import { selectedOrganizationId } from "@/lib/active-company";
import { cn } from "@/lib/utils";
import type { Company } from "@/types";

interface Props {
  companies: Company[];
  /** Narrow sidebar: avatar-only trigger; menu opens to the right. */
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function CompanySwitcher({
  companies,
  collapsed = false,
  onNavigate,
}: Props) {
  const params = useParams<{ id?: string | string[] }>();
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const selectedId = selectedOrganizationId(companies, params, pathname);
  const selected = selectedId
    ? companies.find((c) => c.id === selectedId) ?? null
    : null;

  useEffect(() => {
    detailsRef.current?.removeAttribute("open");
  }, [pathname]);

  return (
    <div className="relative">
      <details ref={detailsRef} className="group">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card px-2 py-2 text-left shadow-sm transition-colors",
            "marker:hidden [&::-webkit-details-marker]:hidden hover:bg-muted/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            collapsed && "justify-center px-1.5",
          )}
          title={collapsed ? "Switch organization" : undefined}
        >
          {selected ? (
            <>
              <Avatar
                src={selected.logo_url}
                alt={selected.name}
                fallback={initialsFor(selected.name)}
                size="sm"
              />
              {!collapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight text-foreground">
                    {selected.name}
                  </p>
                  <p className="text-xs text-muted-foreground">Organization</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                —
              </span>
              {!collapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight text-muted-foreground">
                    No organization
                  </p>
                  <p className="text-xs text-muted-foreground">Organization</p>
                </div>
              ) : null}
            </>
          )}
          {!collapsed ? (
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 opacity-50"
              aria-hidden
            />
          ) : null}
        </summary>

        <div
          className={cn(
            "absolute z-[60] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
            collapsed
              ? "left-full top-0 ml-2 w-[min(280px,calc(100vw-5rem))]"
              : "left-0 right-0 top-[calc(100%+6px)]",
          )}
        >
          <div className="max-h-[min(320px,70vh)] overflow-y-auto p-1">
            {companies.map((company) => {
              const isActive = company.id === selected?.id;
              return (
                <Link
                  key={company.id}
                  href={`/companies/${company.id}`}
                  onClick={() => {
                    detailsRef.current?.removeAttribute("open");
                    onNavigate?.();
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground hover:bg-muted",
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
              );
            })}

            <Link
              href="/companies/new"
              onClick={() => {
                detailsRef.current?.removeAttribute("open");
                onNavigate?.();
              }}
              className="mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              Add a new Organization
            </Link>
          </div>

          {companies.length > 1 ? (
            <div className="border-t border-border px-1 pb-1 pt-0">
              <Link
                href="/companies"
                onClick={() => {
                  detailsRef.current?.removeAttribute("open");
                  onNavigate?.();
                }}
                className="block rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                View all organizations
              </Link>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
