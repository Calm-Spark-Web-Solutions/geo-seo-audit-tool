"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

interface StartAuditButtonProps {
  /** External invalid state (e.g. zero URLs selected, selection over cap). */
  disabled?: boolean;
}

export function StartAuditButton({
  disabled = false,
}: StartAuditButtonProps = {}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className="min-w-[9rem]"
    >
      {pending ? "Running scan…" : "Start visibility scan"}
    </Button>
  );
}
