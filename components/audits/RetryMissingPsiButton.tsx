"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BulkRetryResponse {
  ok: boolean;
  error?: string;
  attempted?: number;
  recovered?: number;
  stillMissing?: number;
  skipped?: number;
}

async function postBulkRetry(auditId: string): Promise<BulkRetryResponse> {
  const res = await fetch(`/api/visibility-scans/${auditId}/psi-retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = (await res.json().catch(() => ({}))) as BulkRetryResponse;
  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? `Request failed (${res.status}).`,
    };
  }
  // Explicitly normalize the success shape so a server that forgot to set
  // `ok: true` in the JSON body still surfaces as a success client-side.
  return {
    ok: true,
    attempted: data.attempted,
    recovered: data.recovered,
    stillMissing: data.stillMissing,
    skipped: data.skipped,
  };
}

function toastIdBulk(auditId: string) {
  return `psi-retry-all:${auditId}`;
}

export function RetryMissingPsiButton({
  auditId,
  missingCount,
  size = "sm",
  variant = "default",
  className,
}: {
  auditId: string;
  /** Used purely for the button label / disabled state. */
  missingCount: number;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const disabled = pending || missingCount === 0;

  const run = async () => {
    const tid = toastIdBulk(auditId);
    setPending(true);
    toast.loading("Retrying Lighthouse for missing pages…", {
      id: tid,
      description:
        "Calling Google PageSpeed Insights for each missing page — typically 15–45 s per page.",
    });
    try {
      const out = await postBulkRetry(auditId);
      if (!out.ok) {
        toast.error(out.error ?? "Bulk retry failed.", { id: tid });
        return;
      }

      const attempted = out.attempted ?? 0;
      const recovered = out.recovered ?? 0;
      const stillMissing = out.stillMissing ?? 0;
      const skipped = out.skipped ?? 0;

      if (attempted === 0 && skipped > 0) {
        toast.warning("Lighthouse retry skipped", {
          id: tid,
          description:
            "PageSpeed Insights is not configured. Contact support to enable retries.",
        });
      } else if (recovered === 0 && stillMissing === 0) {
        toast.success("All pages already have Lighthouse data", { id: tid });
      } else {
        toast.success(
          recovered > 0
            ? `Recovered Lighthouse on ${recovered} page${recovered === 1 ? "" : "s"}`
            : "Lighthouse retry finished",
          {
            id: tid,
            description:
              stillMissing > 0
                ? `${stillMissing} page${stillMissing === 1 ? "" : "s"} still missing Lighthouse — try the per-page button or wait and retry.`
                : "All targeted pages have Lighthouse data now.",
          },
        );
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const label =
    missingCount === 0
      ? "Lighthouse complete"
      : pending
        ? "Retrying…"
        : `Retry Lighthouse on ${missingCount} page${missingCount === 1 ? "" : "s"}`;

  return (
    <div className={cn("inline-flex", className)} aria-busy={pending}>
      {pending ? (
        <p className="sr-only" role="status" aria-live="polite">
          Bulk Lighthouse retry in progress.
        </p>
      ) : null}
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={disabled}
        onClick={() => void run()}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        {label}
      </Button>
    </div>
  );
}
