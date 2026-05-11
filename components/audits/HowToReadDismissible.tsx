"use client";

import { Info, X } from "lucide-react";
import { useEffect, useState } from "react";

import { HOW_TO_READ_AUDIT } from "@/lib/audit/reader-copy";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "geo-audit:howto-page-detail:dismissed";

export function HowToReadDismissible() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    // Hydrate once from localStorage. This is the canonical "read external
    // store on mount" pattern; we cannot read it during render without
    // breaking SSR consistency.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      setDismissed(v === "1");
    } catch {
      setDismissed(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore — banner stays dismissed for this session only
    }
  }

  if (dismissed === null || dismissed) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2",
      )}
      role="note"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
        {HOW_TO_READ_AUDIT}
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="-m-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
