import { ArrowRight } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface CategoryStat {
  category: string;
  avgScore: number;
  pass: number;
  warn: number;
  fail: number;
  total: number;
}

function barBgClass(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-400";
  return "bg-destructive";
}

function scoreTextClass(score: number): string {
  if (score >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function ChecksCategoryBreakdown({
  categories,
  checksHref,
}: {
  categories: CategoryStat[];
  checksHref: string;
}) {
  if (categories.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Checks by category</CardTitle>
          <CardDescription>
            Sorted by score — lower bars are where to focus first.
          </CardDescription>
        </div>
        <Link
          href={checksHref}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
        >
          View all
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {categories.map((cat) => (
            <li key={cat.category}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{cat.category}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">
                    {cat.total} check{cat.total === 1 ? "" : "s"}
                  </span>
                  <span
                    className={`w-7 text-right tabular-nums font-semibold ${scoreTextClass(cat.avgScore)}`}
                  >
                    {cat.avgScore}
                  </span>
                </div>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted/40">
                <div
                  className={barBgClass(cat.avgScore)}
                  style={{ width: `${cat.avgScore}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
