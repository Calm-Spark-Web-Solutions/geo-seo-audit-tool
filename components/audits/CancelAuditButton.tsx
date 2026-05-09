"use client";

import { Loader2, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  cancelAudit,
  type CancelAuditState,
} from "@/app/(dashboard)/audits/[id]/cancel-action";
import { Button } from "@/components/ui/button";

const initialState: CancelAuditState = { ok: true };

interface CancelAuditButtonProps {
  auditId: string;
}

/**
 * Surfaced from `AuditScoreCard` whenever the audit is `pending` or
 * `running`. Posts to the `cancelAudit` server action; the running runner
 * checks `audits.status` between batches and exits cleanly within ~25 s.
 */
export function CancelAuditButton({ auditId }: CancelAuditButtonProps) {
  const [state, action, pending] = useActionState(cancelAudit, initialState);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    // Only fire toasts once the action has completed (pending true -> false).
    // Avoids announcing on initial mount where useActionState seeds with ok.
    if (wasPendingRef.current && !pending) {
      if (state.ok) {
        toast.success("Audit cancelled");
      } else if (state.error) {
        toast.error("Could not cancel audit", { description: state.error });
      }
    }
    wasPendingRef.current = pending;
  }, [state, pending]);

  return (
    <form action={action}>
      <input type="hidden" name="audit_id" value={auditId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label="Cancel running audit"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <XCircle className="h-4 w-4" aria-hidden />
        )}
        {pending ? "Cancelling…" : "Cancel"}
      </Button>
    </form>
  );
}
