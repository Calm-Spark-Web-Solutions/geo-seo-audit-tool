"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Globe2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Community = { id: string; name: string };

export function RunScanCta({
  orgId,
  communities,
}: {
  orgId: string;
  communities: Community[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (communities.length === 0) {
    return (
      <Button asChild>
        <Link href={`/companies/${orgId}/new-community`}>
          <Play className="h-4 w-4" aria-hidden />
          Run visibility scan
        </Link>
      </Button>
    );
  }

  if (communities.length === 1) {
    return (
      <Button asChild>
        <Link href={`/communities/${communities[0].id}/new-visibility-scan`}>
          <Play className="h-4 w-4" aria-hidden />
          Run visibility scan
        </Link>
      </Button>
    );
  }

  const visible = filter.trim()
    ? communities.filter((c) =>
        c.name.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : communities;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Play className="h-4 w-4" aria-hidden />
        Run visibility scan
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 py-12 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md rounded-lg border border-border bg-popover p-4 shadow-lg"
          >
            <div className="space-y-3">
              <div>
                <h2
                  id={headingId}
                  className="text-base font-semibold text-foreground"
                >
                  Which community do you want to scan?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pick a community to start a fresh visibility scan.
                </p>
              </div>

              <Input
                autoFocus
                placeholder="Search communities…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />

              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                {visible.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No communities match &ldquo;{filter}&rdquo;.
                  </p>
                ) : (
                  visible.map((c) => (
                    <Link
                      key={c.id}
                      href={`/communities/${c.id}/new-visibility-scan`}
                      className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm transition-colors last:border-b-0 hover:bg-accent"
                      onClick={() => setOpen(false)}
                    >
                      <Globe2
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{c.name}</span>
                    </Link>
                  ))
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
