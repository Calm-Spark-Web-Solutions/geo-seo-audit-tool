"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

export type SettingsTabId = "billing" | "team" | "organizations" | "profile";

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "billing", label: "Billing" },
  { id: "team", label: "Team" },
  { id: "organizations", label: "Organizations" },
];

export function SettingsTabs({ active }: { active: SettingsTabId }) {
  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={`/settings?tab=${tab.id}`}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "shrink-0 -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
