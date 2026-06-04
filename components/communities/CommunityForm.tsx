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
import { FACILITY_TYPES } from "@/lib/facility-types";
import { cn } from "@/lib/utils";
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

      <Field
        label="Website URL"
        htmlFor="website_url"
        error={state.fieldErrors?.website_url}
        hint="We probe http and https and save whichever canonical URL responds (https preferred)."
      >
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

      <Field
        label="Facility type"
        htmlFor="facility_type"
        error={state.fieldErrors?.facility_type}
        hint="Shown on audit pages and exported PDF reports."
      >
        <select
          id="facility_type"
          name="facility_type"
          defaultValue={initial?.facility_type ?? ""}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          )}
        >
          <option value="">Not set</option>
          {FACILITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      {state.error && !state.fieldErrors ? (
        <p className="text-sm text-destructive">{state.error}</p>
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
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
