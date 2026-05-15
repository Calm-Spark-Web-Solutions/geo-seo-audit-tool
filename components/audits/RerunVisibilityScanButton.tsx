"use client";

import { Loader2, RotateCw } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import {
  rerunVisibilityScan,
  type StartAuditFormState,
} from "@/app/(dashboard)/communities/[id]/new-visibility-scan/actions";
import { Button } from "@/components/ui/button";

const initialState: StartAuditFormState = { ok: true };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RotateCw className="h-4 w-4" aria-hidden />
      )}
      Rerun
    </Button>
  );
}

export function RerunVisibilityScanButton({
  communityId,
  sourceAuditId,
}: {
  communityId: string;
  sourceAuditId: string;
}) {
  const [state, formAction] = useActionState(rerunVisibilityScan, initialState);

  useEffect(() => {
    if (!state.ok && state.error) {
      toast.error("Could not rerun scan", { description: state.error });
    }
  }, [state]);

  return (
    <form action={formAction} className="inline-flex">
      <input type="hidden" name="community_id" value={communityId} />
      <input type="hidden" name="source_audit_id" value={sourceAuditId} />
      <SubmitButton />
    </form>
  );
}
