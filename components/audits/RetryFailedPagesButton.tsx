"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  retryFailedPagesScan,
  type StartAuditFormState,
} from "@/app/(dashboard)/communities/[id]/new-visibility-scan/actions";
import { Button } from "@/components/ui/button";

const initialState: StartAuditFormState = { ok: true };

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden />
      )}
      Retry {count} failed page{count === 1 ? "" : "s"}
    </Button>
  );
}

export function RetryFailedPagesButton({
  communityId,
  sourceAuditId,
  failedCount,
}: {
  communityId: string;
  sourceAuditId: string;
  failedCount: number;
}) {
  const [state, formAction] = useActionState(retryFailedPagesScan, initialState);

  useEffect(() => {
    if (!state.ok && state.error) {
      toast.error("Could not retry failed pages", { description: state.error });
    }
  }, [state]);

  if (failedCount <= 0) return null;

  return (
    <form action={formAction} className="inline-flex">
      <input type="hidden" name="community_id" value={communityId} />
      <input type="hidden" name="source_audit_id" value={sourceAuditId} />
      <SubmitButton count={failedCount} />
    </form>
  );
}
