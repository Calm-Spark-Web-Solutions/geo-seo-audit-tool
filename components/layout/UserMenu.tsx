"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, LogOut, User as UserIcon } from "lucide-react";

import { signOut } from "@/app/(dashboard)/auth-actions";
import { Avatar, initialsFor } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  email: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
}

export function UserMenu({ email, fullName, avatarUrl }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!email) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }

  const display = fullName || email;
  const initials = initialsFor(display);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar src={avatarUrl ?? undefined} alt={display} fallback={initials} size="md" />
      </button>
      <div
        role="menu"
        className={cn(
          "absolute right-0 top-full z-30 mt-2 w-60 origin-top-right rounded-md border border-border bg-popover text-popover-foreground shadow-lg transition",
          open
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="flex items-center gap-3 border-b border-border p-3">
          <Avatar src={avatarUrl ?? undefined} alt={display} fallback={initials} size="sm" />
          <div className="min-w-0">
            {fullName ? (
              <p className="truncate text-sm font-medium">{fullName}</p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <div className="flex flex-col p-1">
          <Link
            href="/companies"
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            <Building2 className="h-4 w-4" aria-hidden />
            Organizations
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            <UserIcon className="h-4 w-4" aria-hidden />
            Settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
              role="menuitem"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
