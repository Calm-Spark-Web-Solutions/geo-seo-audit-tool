"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@teispace/next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

function subscribeNoop() {
  return () => {};
}

/**
 * Segmented "Light / Dark" toggle for the settings row. Renders a two-option
 * group rather than the icon-only `ThemeToggle` used in top bars — easier
 * for non-tech users to discover and label.
 */
export function ColorModeSegmented({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  const current = mounted ? (resolvedTheme === "dark" ? "dark" : "light") : null;

  const buttonBase =
    "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div
      role="group"
      aria-label="Color mode"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-background p-1",
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={current === "light"}
        disabled={!mounted}
        onClick={() => setTheme("light")}
        className={cn(
          buttonBase,
          current === "light"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sun className="h-4 w-4" aria-hidden />
        Light
      </button>
      <button
        type="button"
        aria-pressed={current === "dark"}
        disabled={!mounted}
        onClick={() => setTheme("dark")}
        className={cn(
          buttonBase,
          current === "dark"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="h-4 w-4" aria-hidden />
        Dark
      </button>
    </div>
  );
}
