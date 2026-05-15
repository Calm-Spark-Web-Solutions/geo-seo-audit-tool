import { TrendingDown, TrendingUp } from "lucide-react";

export function DeltaPill({
  delta,
  size = "md",
}: {
  delta: number;
  size?: "sm" | "md";
}) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        —
      </span>
    );
  }

  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const cls = up
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400";
  const iconSize = size === "sm" ? 10 : 12;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums font-medium ${size === "sm" ? "text-[11px]" : "text-xs"} ${cls}`}
    >
      <Icon className="shrink-0" style={{ width: iconSize, height: iconSize }} aria-hidden />
      {up ? "+" : ""}{delta}
    </span>
  );
}
