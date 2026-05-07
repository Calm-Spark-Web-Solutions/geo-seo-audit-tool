"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteCommunity } from "@/app/(dashboard)/communities/actions";
import { Button } from "@/components/ui/button";

interface Props {
  communityId: string;
  communityName: string;
  variant?: "default" | "compact";
}

export function DeleteCommunityButton({
  communityId,
  communityName,
  variant = "default",
}: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    const ok = window.confirm(
      `Delete "${communityName}"? This removes its audit history too.`,
    );
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteCommunity(communityId);
      } catch (err) {
        toast.error("Could not delete community", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    });
  }

  return (
    <Button
      variant="destructive"
      size={variant === "compact" ? "sm" : "default"}
      onClick={onClick}
      disabled={pending}
    >
      <Trash2 className="h-4 w-4" aria-hidden />
      {pending ? "Deleting..." : "Delete"}
    </Button>
  );
}
