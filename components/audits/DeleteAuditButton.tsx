"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteAudit } from "@/app/(dashboard)/visibility-scans/[id]/delete-action";
import { Button } from "@/components/ui/button";

interface DeleteAuditButtonProps {
  auditId: string;
  auditLabel: string;
  variant?: "default" | "compact";
  /** When true, render a disabled button (e.g. while the audit is running). */
  disabled?: boolean;
}

/**
 * Confirms with the user, then calls the `deleteAudit` server action. The
 * action redirects to the parent community on success, so we don't manage
 * post-success navigation here. Failures surface as toasts; `next/navigation`
 * `redirect()` throws a recognised internal error that we let bubble.
 */
export function DeleteAuditButton({
  auditId,
  auditLabel,
  variant = "default",
  disabled = false,
}: DeleteAuditButtonProps) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending || disabled) return;
    const ok = window.confirm(
      `Delete this audit (${auditLabel})? This removes its pages, queued jobs, and any saved PDF.`,
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteAudit(auditId);
      } catch (err) {
        // next/navigation `redirect()` throws a tagged error to unwind the
        // server action — those should not show as toasts. Anything else is
        // a real failure.
        const message = err instanceof Error ? err.message : "Unknown error";
        if (message.includes("NEXT_REDIRECT")) return;
        toast.error("Could not delete audit", { description: message });
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant === "compact" ? "outline" : "destructive"}
      size={variant === "compact" ? "sm" : "default"}
      onClick={onClick}
      disabled={pending || disabled}
      aria-label="Delete audit"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="h-4 w-4" aria-hidden />
      )}
      {variant === "compact" ? null : pending ? "Deleting…" : "Delete audit"}
    </Button>
  );
}
