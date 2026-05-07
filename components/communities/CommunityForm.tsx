"use client";

import { useActionState } from "react";

import {
  createCommunity,
  updateCommunity,
  type CommunityFormState,
} from "@/app/(dashboard)/communities/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Community } from "@/types";

interface Props {
  companyId?: string;
  initial?: Community;
}

const initialState: CommunityFormState = { ok: true };

export function CommunityForm({ companyId, initial }: Props) {
  const isEdit = Boolean(initial);
  const action = isEdit ? updateCommunity : createCommunity;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {isEdit ? <input type="hidden" name="id" value={initial!.id} /> : null}
      {!isEdit && companyId ? (
        <input type="hidden" name="company_id" value={companyId} />
      ) : null}

      <Field label="Community name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name ?? ""}
        />
      </Field>

      <Field label="Website URL" htmlFor="website_url" error={state.fieldErrors?.website_url}>
        <Input
          id="website_url"
          name="website_url"
          type="url"
          required
          maxLength={500}
          defaultValue={initial?.website_url ?? ""}
          placeholder="https://example.com"
        />
      </Field>

      {state.error && !state.fieldErrors ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? isEdit
              ? "Saving..."
              : "Creating..."
            : isEdit
              ? "Save changes"
              : "Add community"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
