"use client";

import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AuditCheckEvidenceItem } from "@/types";

type LinkItem = Extract<AuditCheckEvidenceItem, { type: "link" }>;
type SortKey = "url" | "anchor";
type SortDir = "asc" | "desc";

function compare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function InspectorLinksTable({
  items,
  title = "All sampled links",
  description = "Search by URL or anchor text. Click a column header to sort.",
  className,
}: {
  items: LinkItem[];
  title?: string;
  description?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("url");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered =
      needle.length === 0
        ? items
        : items.filter(
            (it) =>
              it.url.toLowerCase().includes(needle) ||
              (it.anchor?.toLowerCase().includes(needle) ?? false),
          );
    const sorted = [...filtered].sort((a, b) => {
      const av = sortKey === "url" ? a.url : a.anchor ?? "";
      const bv = sortKey === "url" ? b.url : b.anchor ?? "";
      const cmp = compare(av, bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [items, q, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by URL or anchor text"
            className="pl-9"
          />
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("url")}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    URL
                    {sortKey === "url" ? (
                      <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                    ) : null}
                  </button>
                </th>
                <th scope="col" className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("anchor")}
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Anchor
                    {sortKey === "anchor" ? (
                      <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                    ) : null}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">
                    No links match this filter.
                  </td>
                </tr>
              ) : (
                visible.map((it, i) => (
                  <tr key={`${it.url}-${i}`} className="border-t border-border">
                    <td className="px-3 py-2 align-top">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-1 break-all font-mono text-xs text-foreground hover:underline"
                      >
                        {it.url}
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      </a>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                      {it.anchor || <span className="italic">(no anchor text)</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {items.length} sampled link
          {items.length === 1 ? "" : "s"}.
        </p>
      </CardContent>
    </Card>
  );
}
