import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GscQueryRow } from "@/types";

/** Color-code position so non-technical users can spot wins / losses. */
function positionTone(position: number): {
  className: string;
  label: string;
} {
  if (position <= 3) {
    return {
      className:
        "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
      label: "Top 3",
    };
  }
  if (position <= 10) {
    return {
      className:
        "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
      label: "Top 10",
    };
  }
  return {
    className: "bg-muted text-muted-foreground",
    label: "Beyond page 1",
  };
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
  rows: GscQueryRow[] | null | undefined;
  /** Max rows to show; default 25. */
  limit?: number;
  /** Override the default headline copy (e.g. for a per-page panel). */
  title?: string;
  description?: string;
}

export function SearchQueriesTable({
  rows,
  limit = 25,
  title,
  description,
}: Props) {
  const safeRows = (rows ?? []).slice(0, limit);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {title ?? "Top search queries"}
        </CardTitle>
        <CardDescription>
          {description ??
            "What people typed into Google in the last 28 days to land on this community."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {safeRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No queries reported by Google yet. New sites often take a few weeks
            of impressions before Search Console has data to show here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Query</th>
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
                {safeRows.map((row) => {
                  const tone = positionTone(row.position);
                  return (
                    <tr key={row.query} className="align-top">
                      <td className="py-2 pr-3">
                        <span className="font-medium text-foreground">
                          {row.query}
                        </span>
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
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            tone.className,
                          )}
                          title={tone.label}
                        >
                          {formatPosition(row.position)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
