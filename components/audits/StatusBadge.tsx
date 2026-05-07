import { Badge } from "@/components/ui/badge";
import type { AuditStatus } from "@/types";

const variantMap: Record<
  AuditStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  running: "default",
  complete: "outline",
  failed: "destructive",
};

export function StatusBadge({ status }: { status: AuditStatus }) {
  return (
    <Badge variant={variantMap[status]} className="capitalize">
      {status}
    </Badge>
  );
}
