"use client";

import { Download, ExternalLink, FileDown, Loader2, Save } from "lucide-react";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";

import {
  getSignedReportUrl,
  savePdfToStorage,
  type SavePdfState,
  type SignedUrlState,
} from "@/app/(dashboard)/visibility-scans/[id]/actions";
import { Button } from "@/components/ui/button";

const initialSaveState: SavePdfState = { ok: true };
const initialSignedState: SignedUrlState = { ok: true };

interface PdfActionsProps {
  auditId: string;
  hasSavedPdf: boolean;
  generatedAt: string | null;
  variant?: "card" | "row";
}

export function PdfActions({
  auditId,
  hasSavedPdf,
  generatedAt,
  variant = "card",
}: PdfActionsProps) {
  const [saveState, saveAction, savePending] = useActionState(
    savePdfToStorage,
    initialSaveState,
  );

  const [signedState, signedAction, signedPending] = useActionState(
    getSignedReportUrl,
    initialSignedState,
  );

  const [, startSavedTransition] = useTransition();

  useEffect(() => {
    if (savePending) return;
    if (saveState.ok && saveState.path) {
      toast.success("PDF saved to storage", {
        description: "You can now share the saved report via signed URL.",
      });
    } else if (saveState.error) {
      toast.error("Could not save PDF", {
        description: saveState.error,
      });
    }
  }, [saveState, savePending]);

  useEffect(() => {
    if (signedPending) return;
    if (signedState.ok && signedState.url) {
      // Same-tab navigation avoids popup blockers (window.open after an
      // async action is treated as programmatic and frequently blocked).
      window.location.assign(signedState.url);
    } else if (signedState.error) {
      toast.error("Could not open saved PDF", {
        description: signedState.error,
      });
    }
  }, [signedState, signedPending]);

  const showSaved = hasSavedPdf;
  const generatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleString()
    : null;

  return (
    <div
      className={
        variant === "row"
          ? "flex flex-wrap items-center gap-2"
          : "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      {variant === "card" ? (
        <div className="flex flex-col">
          <span className="text-sm font-medium">PDF report</span>
          <span className="text-xs text-muted-foreground">
            Full, SEO-only, or GEO-only PDF downloads. Saving to storage keeps the
            combined report only for signed URLs.
            {showSaved && generatedLabel ? (
              <>
                {" "}
                Last saved {generatedLabel}.
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/visibility-scans/${auditId}/report.pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="h-4 w-4" aria-hidden />
            Full report
          </a>
        </Button>

        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/visibility-scans/${auditId}/report.pdf?variant=seo`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="h-4 w-4" aria-hidden />
            SEO PDF
          </a>
        </Button>

        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/visibility-scans/${auditId}/report.pdf?variant=geo`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="h-4 w-4" aria-hidden />
            GEO PDF
          </a>
        </Button>

        <form action={saveAction}>
          <input type="hidden" name="audit_id" value={auditId} />
          <Button type="submit" size="sm" disabled={savePending}>
            {savePending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            {savePending ? "Saving…" : "Save to storage"}
          </Button>
        </form>

        {showSaved ? (
          <form
            action={(formData) => {
              startSavedTransition(() => {
                signedAction(formData);
              });
            }}
          >
            <input type="hidden" name="audit_id" value={auditId} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={signedPending}
            >
              {signedPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ExternalLink className="h-4 w-4" aria-hidden />
              )}
              {signedPending ? "Opening…" : "View saved PDF"}
            </Button>
          </form>
        ) : (
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
            <FileDown className="h-3.5 w-3.5" aria-hidden />
            No saved PDF yet
          </span>
        )}
      </div>
    </div>
  );
}
