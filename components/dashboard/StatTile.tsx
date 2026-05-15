import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DeltaPill } from "@/components/dashboard/DeltaPill";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function scoreColor(value: number | string | null): string {
  if (typeof value !== "number") return "text-foreground";
  if (value >= 80) return "text-emerald-700 dark:text-emerald-400";
  if (value >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function sparkColorHex(value: number | null): string {
  if (value === null) return "#94a3b8";
  if (value >= 80) return "#059669";
  if (value >= 50) return "#d97706";
  return "#dc2626";
}

interface Props {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** If set, color the big number by score thresholds (≥80/≥50/else) */
  scoreColored?: boolean;
  /** Show a delta pill in the bottom-right */
  delta?: number;
  /** Show a sparkline in the bottom-right (overrides delta) */
  spark?: number[];
  className?: string;
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  scoreColored,
  delta,
  spark,
  className,
}: Props) {
  const numValue = typeof value === "number" ? value : null;
  const valueClass = scoreColored ? scoreColor(numValue) : "text-foreground";
  const sparkCol = spark ? sparkColorHex(numValue) : undefined;

  return (
    <Card className={cn("h-full", className)}>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>

        <p className={cn("text-3xl font-semibold tracking-tight tabular-nums leading-none", valueClass)}>
          {value}
        </p>

        <div className="flex items-center justify-between gap-3">
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : (
            <span />
          )}
          {spark && spark.length >= 2 ? (
            <Sparkline
              data={spark}
              color={sparkCol}
              width={64}
              height={22}
              fill
            />
          ) : delta !== undefined ? (
            <DeltaPill delta={delta} size="sm" />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
