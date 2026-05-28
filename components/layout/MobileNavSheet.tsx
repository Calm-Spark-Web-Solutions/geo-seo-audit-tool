"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

import { SidebarContent } from "@/components/layout/SidebarContent";
import { Button } from "@/components/ui/button";
import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { DashboardAccount } from "@/lib/layout/dashboard-account";
import type { SidebarNavHrefs } from "@/lib/layout/sidebar-nav-hrefs";
import type { Company } from "@/types";

export function MobileNavSheet({
  companies,
  account,
  quota,
  activeOrganizationIdCookie,
  navHrefs,
}: {
  companies: Company[];
  account: DashboardAccount | null;
  quota: AuditQuotaSnapshot;
  activeOrganizationIdCookie: string | null;
  navHrefs: SidebarNavHrefs;
}) {
  const [open, setOpen] = useState(false);
  const isClient = useIsClient();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on navigation. This is the canonical pattern for dismissing a
  // drawer/modal when the route changes — synchronizing UI state with an
  // external value (the router pathname).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    panelRef.current?.focus();
    document.body.style.overflow = "hidden";

    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("data-skip-focus-trap"));
      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      trigger?.focus();
    };
  }, [open]);

  const sheet =
    open && isClient ? (
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
          onClick={close}
        />
        <div
          ref={panelRef}
          id="mobile-nav-sheet"
          tabIndex={-1}
          className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg outline-none"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarContent
              companies={companies}
              account={account}
              quota={quota}
              activeOrganizationIdCookie={activeOrganizationIdCookie}
              navHrefs={navHrefs}
              variant="mobile"
              onNavigate={close}
              onClose={close}
            />
          </div>
        </div>
      </div>
    ) : null;

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
      {sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}
