import { cn } from "@/lib/utils";
import type { GoogleMappingStatus } from "@/lib/integrations/google/google-properties-ui";

const LABELS: Record<GoogleMappingStatus, string> = {
  mapped: "Mapped",
  partial: "Partial",
  none: "Not mapped",
};

const STYLES: Record<GoogleMappingStatus, string> = {
  mapped:
    "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  partial:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  none: "bg-muted text-muted-foreground",
};

export function GoogleMappingStatusBadge({
  status,
  className,
}: {
  status: GoogleMappingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
