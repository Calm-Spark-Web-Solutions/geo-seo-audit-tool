"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface Props {
  communityId: string;
  /** When set, GSC permission warnings link here to remap properties. */
  googleSetupHref?: string;
}

export function RefreshGoogleMetricsButton({
  communityId,
  googleSetupHref,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    setWarnings([]);
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
      setMessage("Google data updated.");
      setWarnings(data.warnings ?? []);
      router.refresh();
    } catch {
      setError("Could not refresh Google data.");
    } finally {
      setLoading(false);
    }
  }

  const gscPermissionWarning = warnings.some((w) =>
    w.includes("does not have access to the mapped Search Console"),
  );

  return (
    <div className="flex flex-col gap-2">
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
      {warnings.length > 0 ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">Some data could not be refreshed</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {gscPermissionWarning && googleSetupHref ? (
            <p className="mt-2 text-amber-900/90 dark:text-amber-200/90">
              Use the Google account that has full access to this site in Search
              Console, or choose a different property on the{" "}
              <Link
                href={googleSetupHref}
                className="font-medium text-amber-950 underline underline-offset-4 dark:text-amber-100"
              >
                Google setup
              </Link>{" "}
              page, then refresh again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
