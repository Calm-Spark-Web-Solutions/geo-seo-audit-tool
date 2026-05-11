"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  retryAuditRunner,
  type RetryRunnerState,
} from "@/app/(dashboard)/visibility-scans/[id]/retry-runner-action";
import { Button } from "@/components/ui/button";

const initialState: RetryRunnerState = { ok: true };

interface RetryRunnerButtonProps {
  auditId: string;
}

export function RetryRunnerButton({ auditId }: RetryRunnerButtonProps) {
  const [state, action, pending] = useActionState(
    retryAuditRunner,
    initialState,
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    if (state.ok && state.error === undefined) {
      toast.success("Runner kick sent");
    }
    if (!state.ok && state.error) {
      toast.error("Could not retry runner", { description: state.error });
    }
  }, [pending, state]);

  return (
    <form action={action}>
      <input type="hidden" name="audit_id" value={auditId} />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-label="Retry audit runner"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RotateCw className="h-4 w-4" aria-hidden />
        )}
        {pending ? "Sending…" : "Retry runner"}
      </Button>
    </form>
  );
}
