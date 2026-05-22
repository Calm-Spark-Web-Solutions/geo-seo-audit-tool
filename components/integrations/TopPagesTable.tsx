import { ExternalLink } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GscPageRow } from "@/types";

/** Show the URL pathname + last segment of host so non-technical users can
 * recognise the page without overwhelming the table. Falls back to the raw
 * URL on parse errors. */
function displayPath(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname === "/" ? "/" : u.pathname.replace(/\/$/, "");
    return path;
  } catch {
    return rawUrl;
  }
}

function positionTone(position: number): string {
  if (position <= 3)
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (position <= 10)
    return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-muted text-muted-foreground";
}

function formatPosition(position: number): string {
  if (!Number.isFinite(position) || position <= 0) return "—";
  return position.toFixed(1);
}

function formatCtr(ctr: number): string {
  if (!Number.isFinite(ctr) || ctr <= 0) return "—";
  return `${(ctr * 100).toFixed(1)}%`;
}

interface Props {
  rows: GscPageRow[] | null | undefined;
  limit?: number;
  title?: string;
  description?: string;
}

export function TopPagesTable({
  rows,
  limit = 25,
  title,
  description,
}: Props) {
  const safeRows = (rows ?? []).slice(0, limit);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title ?? "Top landing pages"}</CardTitle>
        <CardDescription>
          {description ??
            "The pages on your site that Google sent the most visitors to over the last 28 days."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {safeRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No landing pages reported by Google yet. Once your pages start
            ranking in search results, they will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Page</th>
                  <th className="py-2 pr-3 font-medium tabular-nums text-right">
                    Clicks
                  </th>
                  <th className="py-2 pr-3 font-medium tabular-nums text-right">
                    Impressions
                  </th>
                  <th className="py-2 pr-3 font-medium tabular-nums text-right">
                    CTR
                  </th>
                  <th className="py-2 font-medium tabular-nums text-right">
                    Position
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {safeRows.map((row) => (
                  <tr key={row.page} className="align-top">
                    <td className="py-2 pr-3">
                      <a
                        href={row.page}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-[24ch] items-center gap-1 truncate font-medium text-foreground hover:underline sm:max-w-[36ch]"
                        title={row.page}
                      >
                        <span className="truncate">{displayPath(row.page)}</span>
                        <ExternalLink
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </a>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {row.clicks.toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {row.impressions.toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatCtr(row.ctr)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          positionTone(row.position),
                        )}
                      >
                        {formatPosition(row.position)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
