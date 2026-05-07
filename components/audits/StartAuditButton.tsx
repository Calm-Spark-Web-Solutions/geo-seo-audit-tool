"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function StartAuditButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="min-w-[9rem]">
      {pending ? "Running audit…" : "Start audit"}
    </Button>
  );
}
