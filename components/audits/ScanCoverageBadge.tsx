import { cn } from "@/lib/utils";
import type { ScanCoverageKind } from "@/lib/audit/partial-crawl";

const LABEL: Record<Exclude<ScanCoverageKind, "running">, string> = {
  full: "Full crawl",
  partial: "Partial",
  none: "No pages",
};

const STYLES: Record<Exclude<ScanCoverageKind, "running">, string> = {
  full: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  partial: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  none: "border-muted-foreground/30 bg-muted/50 text-muted-foreground",
};

export function ScanCoverageBadge({
  kind,
  className,
}: {
  kind: ScanCoverageKind;
  className?: string;
}) {
  if (kind === "running") return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STYLES[kind],
        className,
      )}
    >
      {LABEL[kind]}
    </span>
  );
}
