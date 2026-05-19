"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 25_000;
const MAX_POLL_MS = 10 * 60 * 1000;

/**
 * Refreshes the scan page while background PSI drain may still be running,
 * so Lighthouse coverage counts update without manual reload.
 */
export function PsiBackfillPoller({
  auditId,
  missingCount,
}: {
  auditId: string;
  missingCount: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (missingCount <= 0) return;

    const started = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - started >= MAX_POLL_MS) {
        clearInterval(interval);
        return;
      }
      router.refresh();
    }, REFRESH_MS);

    const stop = setTimeout(() => clearInterval(interval), MAX_POLL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [auditId, missingCount, router]);

  return (
    <p className="sr-only" role="status" aria-live="polite">
      Lighthouse backfill in progress for {missingCount} page
      {missingCount === 1 ? "" : "s"}.
    </p>
  );
}
