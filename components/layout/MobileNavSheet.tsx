"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SidebarContent } from "@/components/layout/SidebarContent";
import { Button } from "@/components/ui/button";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import type { Company } from "@/types";

export function MobileNavSheet({
  companies,
  account,
  quota,
}: {
  companies: Company[];
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on navigation. This is the canonical pattern for dismissing a
  // drawer/modal when the route changes — synchronizing UI state with an
  // external value (the router pathname).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav-sheet"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id="mobile-nav-sheet"
            tabIndex={-1}
            className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col gap-6 border-r border-border bg-background p-4 shadow-lg outline-none"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Menu</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SidebarContent
                companies={companies}
                account={account}
                quota={quota}
                variant="mobile"
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
