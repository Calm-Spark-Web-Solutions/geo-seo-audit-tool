"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onAccept() {
    setPending(true);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { companyId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to accept invite");
      toast.success("Joined organization");
      router.push(data.companyId ? `/companies/${data.companyId}` : "/dashboard");
      router.refresh();
    } catch (err) {
      toast.error("Could not accept invite", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={onAccept} disabled={pending} className="w-full">
      {pending ? "Accepting..." : "Accept invite"}
    </Button>
  );
}
