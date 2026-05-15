"use client";

import {
  ChevronDown,
  Gauge,
  ListChecks,
  LayoutDashboard,
  Search,
  Share2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface PageDetailNavProps {
  auditId: string;
  pageId: string;
}

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Match this item when pathname is exactly base, or starts with `${base}/`. */
  matchPrefix?: string;
  /** Inspector dropdown is special; only inspectors get a chevron. */
  hasChildren?: boolean;
}

const INSPECTORS: Array<{ id: string; label: string; slug: string }> = [
  { id: "links", label: "Internal links", slug: "links" },
  { id: "images", label: "Images & alt", slug: "images" },
  { id: "schema", label: "Structured data", slug: "schema" },
];

export function PageDetailNav({ auditId, pageId }: PageDetailNavProps) {
  const pathname = usePathname() ?? "";
  const base = `/visibility-scans/${auditId}/pages/${pageId}`;

  const items: NavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: base,
      icon: LayoutDashboard,
    },
    {
      id: "lighthouse",
      label: "Lighthouse",
      href: `${base}/inspectors/lighthouse`,
      icon: Gauge,
    },
    {
      id: "social-preview",
      label: "Social preview",
      href: `${base}/social-preview`,
      icon: Share2,
    },
    {
      id: "checks",
      label: "Checks",
      href: `${base}/checks`,
      icon: ListChecks,
    },
    {
      id: "fixes",
      label: "Fixes",
      href: `${base}/fixes`,
      icon: Wrench,
    },
    {
      id: "inspectors",
      label: "Inspectors",
      href: `${base}/inspectors/links`,
      matchPrefix: `${base}/inspectors`,
      icon: Search,
      hasChildren: true,
    },
  ];

  function isActive(item: NavItem): boolean {
    // Overview is "active" only on the exact route; otherwise the more specific
    // route (e.g. /checks) would never win the highlight.
    if (item.id === "overview") {
      return pathname === item.href;
    }
    // Lighthouse lives under /inspectors/lighthouse — special-case so it
    // doesn't also light up the Inspectors group.
    if (item.id === "lighthouse") {
      return pathname === item.href;
    }
    if (item.id === "inspectors") {
      // Highlight Inspectors for any /inspectors/* except lighthouse.
      return (
        pathname.startsWith(`${base}/inspectors/`) &&
        pathname !== `${base}/inspectors/lighthouse`
      );
    }
    const prefix = item.matchPrefix ?? item.href;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }

  return (
    <nav
      aria-label="Audit page sections"
      className="sticky top-0 z-20 -mx-3 mb-1 border-b border-border bg-background/95 px-3 backdrop-blur sm:-mx-4 sm:px-4 md:-mx-6 md:px-6"
    >
      <ul className="-mx-1 flex items-center gap-0.5 overflow-x-auto py-2 text-sm">
        {items.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span>{item.label}</span>
                {item.hasChildren ? (
                  <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {pathname.startsWith(`${base}/inspectors/`) ? (
        <ul className="-mx-1 flex items-center gap-0.5 overflow-x-auto border-t border-border/60 py-1.5 text-xs">
          {INSPECTORS.map((insp) => {
            const href = `${base}/inspectors/${insp.slug}`;
            const active = pathname === href;
            return (
              <li key={insp.id} className="shrink-0">
                <Link
                  href={href}
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-1 transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {insp.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </nav>
  );
}
