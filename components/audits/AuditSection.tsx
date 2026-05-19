"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AuditSection({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-lg border border-border bg-card",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {badge ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </summary>
      <div className="border-t border-border px-4 pb-4 pt-3 sm:px-5">{children}</div>
    </details>
  );
}
