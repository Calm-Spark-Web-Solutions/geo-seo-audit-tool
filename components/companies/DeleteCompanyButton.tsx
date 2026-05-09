"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteCompany } from "@/app/(dashboard)/companies/actions";
import { Button } from "@/components/ui/button";

interface Props {
  companyId: string;
  companyName: string;
}

export function DeleteCompanyButton({ companyId, companyName }: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    const ok = window.confirm(
      `Delete "${companyName}"? This also removes its communities and audit history.`,
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteCompany(companyId);
      } catch (err) {
        // `redirect()` from server actions throws a tagged NEXT_REDIRECT error
        // we must let bubble silently — only surface real failures.
        const message = err instanceof Error ? err.message : "Unknown error";
        if (message.includes("NEXT_REDIRECT")) return;
        toast.error("Could not delete organization", { description: message });
      }
    });
  }

  return (
    <Button variant="destructive" onClick={onClick} disabled={pending}>
      <Trash2 className="h-4 w-4" aria-hidden />
      {pending ? "Deleting..." : "Delete"}
    </Button>
  );
}
