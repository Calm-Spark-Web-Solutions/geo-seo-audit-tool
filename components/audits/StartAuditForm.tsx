"use client";

import { useActionState } from "react";

import {
  startAudit,
  type StartAuditFormState,
} from "@/app/(dashboard)/communities/[id]/new-audit/actions";
import { StartAuditButton } from "@/components/audits/StartAuditButton";

const initialState: StartAuditFormState = { ok: true };

export function StartAuditForm({ communityId }: { communityId: string }) {
  const [state, formAction] = useActionState(startAudit, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="community_id" value={communityId} />
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <StartAuditButton />
      </div>
    </form>
  );
}
