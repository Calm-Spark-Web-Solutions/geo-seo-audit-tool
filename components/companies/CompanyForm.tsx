"use client";

import { useActionState } from "react";

import {
  createCompany,
  updateCompany,
  type CompanyFormState,
} from "@/app/(dashboard)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Company } from "@/types";

interface Props {
  initial?: Company;
  defaults?: {
    contact_name?: string | null;
    contact_email?: string | null;
  };
}

const initialState: CompanyFormState = { ok: true };

export function CompanyForm({ initial, defaults }: Props) {
  const isEdit = Boolean(initial);
  const action = isEdit ? updateCompany : createCompany;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {isEdit ? <input type="hidden" name="id" value={initial!.id} /> : null}

      <Field
        label="Organization name"
        htmlFor="name"
        hint="The company or agency this account represents (e.g. “Compass Senior Living”)."
        error={state.fieldErrors?.name}
      >
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name ?? ""}
          autoComplete="organization"
          placeholder="Acme Senior Living"
        />
      </Field>

      <Field
        label="Primary contact"
        htmlFor="contact_name"
        hint="Person we should reach out to about this organization."
        error={state.fieldErrors?.contact_name}
      >
        <Input
          id="contact_name"
          name="contact_name"
          maxLength={120}
          defaultValue={initial?.contact_name ?? defaults?.contact_name ?? ""}
          autoComplete="name"
          placeholder="Full name"
        />
      </Field>

      <Field
        label="Contact email"
        htmlFor="contact_email"
        error={state.fieldErrors?.contact_email}
      >
        <Input
          id="contact_email"
          name="contact_email"
          type="email"
          maxLength={255}
          defaultValue={
            initial?.contact_email ?? defaults?.contact_email ?? ""
          }
          autoComplete="email"
          placeholder="name@example.com"
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
              : "Create organization"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
