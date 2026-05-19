"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface Props {
  communityId: string;
}

export function RefreshGoogleMetricsButton({ communityId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/integrations/google/metrics-sync/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: communityId }),
      });
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        warnings?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? "Could not refresh Google data.");
        return;
      }
      const warn =
        data.warnings && data.warnings.length > 0
          ? ` Updated with warnings: ${data.warnings.join(" · ")}`
          : "";
      setMessage(`Google data updated.${warn}`);
      router.refresh();
    } catch {
      setError("Could not refresh Google data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? "Refreshing…" : "Refresh Google data"}
      </Button>
      {message ? (
        <span className="text-sm text-green-700 dark:text-green-400" role="status">
          {message}
        </span>
      ) : null}
      {error ? (
        <span className="text-sm text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
