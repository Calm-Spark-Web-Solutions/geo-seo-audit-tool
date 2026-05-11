import type { FixItem, FixPriority } from "@/types";

const PRIORITY_ORDER: FixPriority[] = ["high", "medium", "low"];

const PRIORITY_TONE: Record<FixPriority, string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

export interface FixesListProps {
  fixes: FixItem[];
  /** When set, only the first N items per priority are rendered. */
  limit?: number;
}

export function FixesList({ fixes, limit }: FixesListProps) {
  const grouped = PRIORITY_ORDER.map((priority) => ({
    priority,
    items: fixes.filter((f) => f.priority === priority),
  })).filter((g) => g.items.length > 0);

  if (grouped.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {grouped.map((group) => {
        const visible = typeof limit === "number"
          ? group.items.slice(0, limit)
          : group.items;
        const hiddenCount = group.items.length - visible.length;
        return (
          <div key={group.priority} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_TONE[group.priority]}`}
              >
                {group.priority} priority
              </span>
              <span className="text-xs text-muted-foreground">
                {group.items.length} item{group.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {visible.map((fix, i) => (
                <li
                  key={`${fix.title}-${i}`}
                  className="rounded-md border border-border bg-card px-3 py-2"
                >
                  <p className="font-medium">{fix.title}</p>
                  <p className="text-muted-foreground">{fix.detail}</p>
                </li>
              ))}
              {hiddenCount > 0 ? (
                <li className="text-xs text-muted-foreground">
                  +{hiddenCount} more {group.priority}-priority item
                  {hiddenCount === 1 ? "" : "s"}
                </li>
              ) : null}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
