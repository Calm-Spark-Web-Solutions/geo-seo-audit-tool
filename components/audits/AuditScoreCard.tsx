import { AlertTriangle, Calendar } from "lucide-react";

import { CancelAuditButton } from "@/components/audits/CancelAuditButton";
import { RetryRunnerButton } from "@/components/audits/RetryRunnerButton";
import { ProgressBar } from "@/components/audits/ProgressBar";
import { StatusBadge } from "@/components/audits/StatusBadge";
import { AUDIT_RUNNING_EXPECTATION } from "@/lib/audit/reader-copy";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Audit, AuditQueueDiagnostics, AuditStatus } from "@/types";

function pendingRunnerHint(
  queue: AuditQueueDiagnostics | null | undefined,
): string | null {
  if (!queue) {
    return "No scan job row was found — the enqueue step may have failed, or data is still loading.";
  }
  const status = queue.jobStatus;
  if (status === "queued") {
    return "Waiting for the scan runner to pick up this job…";
  }
  if (status === "running") {
    return "Runner claimed this job and is starting (site checks, then URL discovery)…";
  }
  return `Background job status: ${status ?? "unknown"}. If the scan does not progress, try Retry runner.`;
}

export function AuditScoreCard({
  audit,
  queue,
}: {
  audit: Audit;
  queue?: AuditQueueDiagnostics | null;
}) {
  const date = new Date(audit.created_at).toLocaleString();
  const isRunning = audit.status === "pending" || audit.status === "running";
  const progressTotal = audit.progress_total ?? 0;
  const indeterminateProgress = isRunning && progressTotal === 0;
  const retryLikely =
    audit.status === "pending" &&
    progressTotal > 0 &&
    audit.pages_crawled === 0;
  const showPendingQueueHint =
    audit.status === "pending" && progressTotal === 0 && isRunning;
  const devRunnerEnvHint =
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    queue?.jobStatus === "queued";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-xl">Visibility scan results</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            {date}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={audit.status as AuditStatus} />
          {isRunning ? (
            <>
              <RetryRunnerButton auditId={audit.id} />
              <CancelAuditButton auditId={audit.id} />
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isRunning && queue?.lastError ? (
          <div
            role="status"
            className="flex gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden
            />
            <div className="min-w-0 space-y-1">
              <p className="font-medium">
                Runner retry — attempt {queue.attempts} of {queue.maxAttempts}
              </p>
              <p className="text-xs leading-relaxed opacity-90">
                {queue.lastError}
              </p>
              <p className="text-xs text-muted-foreground dark:text-amber-200/80">
                The scan may continue automatically. Use Retry runner if it
                stays stuck.
              </p>
            </div>
          </div>
        ) : null}
        {isRunning ? (
          <div className="flex flex-col gap-3">
            <ProgressBar
              label={
                retryLikely
                  ? "Retrying or scoring pages…"
                  : audit.status === "pending"
                    ? "Discovering URLs…"
                    : "Scanning pages…"
              }
              value={audit.pages_crawled}
              max={progressTotal}
              busy
              indeterminate={indeterminateProgress}
            />
            {showPendingQueueHint ? (
              <p
                role="status"
                className="text-xs leading-relaxed text-muted-foreground"
              >
                {pendingRunnerHint(queue)}
                {devRunnerEnvHint ? (
                  <>
                    {" "}
                    <span className="text-foreground/80">
                      Locally, ensure{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                        NEXT_PUBLIC_SITE_URL
                      </code>{" "}
                      is a base URL this dev server can reach — the app POSTs
                      the runner kick to that host.
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {AUDIT_RUNNING_EXPECTATION}
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-4">
          <ScoreBlock label="Overall" value={audit.score} emphasized />
          <ScoreBlock label="SEO" value={audit.seo_score} />
          <ScoreBlock label="GEO" value={audit.geo_score} />
          <ScoreBlock label="Pages crawled" value={audit.pages_crawled} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBlock({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: number | null;
  emphasized?: boolean;
}) {
  return (
    <div
      className={
        emphasized
          ? "rounded-lg border border-border bg-muted/40 px-4 py-3"
          : "rounded-lg border border-border px-4 py-3"
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={emphasized ? "text-2xl font-semibold" : "text-lg font-medium"}>
        {value ?? "—"}
      </p>
    </div>
  );
}
