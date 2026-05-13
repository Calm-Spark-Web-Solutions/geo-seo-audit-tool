"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function postRefresh(
  auditId: string,
  pageId: string,
  mode: "psi" | "full",
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(
    `/api/visibility-scans/${auditId}/pages/${pageId}/refresh`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
  };
  if (!res.ok) {
    return {
      ok: false,
      message: data.error ?? `Request failed (${res.status}).`,
    };
  }
  return { ok: true };
}

function toastIdPsi(auditId: string, pageId: string) {
  return `refresh-psi:${auditId}:${pageId}`;
}

function toastIdFull(auditId: string, pageId: string) {
  return `refresh-full:${auditId}:${pageId}`;
}

export function RefreshAuditPageButtons({
  auditId,
  pageId,
  layout = "stacked",
  showFullReanalyze = true,
  className,
}: {
  auditId: string;
  pageId: string;
  /** "inline" keeps buttons on one row where space allows. */
  layout?: "stacked" | "inline";
  /** Full stack re-run (HTML + AI + PSI); omit on minimal surfaces. */
  showFullReanalyze?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [psiPending, setPsiPending] = useState(false);
  const [fullPending, setFullPending] = useState(false);

  const busy = psiPending || fullPending;

  const runPsi = async () => {
    const tid = toastIdPsi(auditId, pageId);
    setPsiPending(true);
    toast.loading("Running PageSpeed…", {
      id: tid,
      description: "Calling Google PageSpeed Insights — often 15–45 seconds.",
    });
    try {
      const out = await postRefresh(auditId, pageId, "psi");
      if (!out.ok) {
        toast.error(out.message, { id: tid });
        return;
      }
      toast.success("PageSpeed complete", {
        id: tid,
        description:
          "Lighthouse checks and this page’s score were saved. Visibility scan totals were refreshed.",
      });
      router.refresh();
    } finally {
      setPsiPending(false);
    }
  };

  const runFull = async () => {
    const ok = window.confirm(
      "Re-analyze this entire page? This fetches fresh HTML and runs all checks including AI scoring (uses more time and API usage than PageSpeed-only).",
    );
    if (!ok) return;
    const tid = toastIdFull(auditId, pageId);
    setFullPending(true);
    toast.loading("Re-analyzing page…", {
      id: tid,
      description: "Fetching HTML, PageSpeed, and AI scoring — may take a minute or more.",
    });
    try {
      const res = await postRefresh(auditId, pageId, "full");
      if (!res.ok) {
        toast.error(res.message, { id: tid });
        return;
      }
      toast.success("Page re-analyzed", {
        id: tid,
        description:
          "Checks, scores, and fixes were saved. Visibility scan totals were refreshed.",
      });
      router.refresh();
    } finally {
      setFullPending(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        layout === "stacked" ? "flex-col sm:flex-row" : "",
        className,
      )}
      aria-busy={busy}
    >
      {busy ? (
        <p className="sr-only" role="status" aria-live="polite">
          {psiPending
            ? "PageSpeed request in progress."
            : "Full page re-analysis in progress."}
        </p>
      ) : null}
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={busy}
        onClick={() => void runPsi()}
      >
        {psiPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        {psiPending ? "Running PageSpeed…" : "Run PageSpeed again"}
      </Button>
      {showFullReanalyze ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          title="Fetches HTML and re-runs deterministic checks, PageSpeed, and AI analysis."
          onClick={() => void runFull()}
        >
          {fullPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          {fullPending ? "Re-analyzing…" : "Re-analyze entire page"}
        </Button>
      ) : null}
    </div>
  );
}
