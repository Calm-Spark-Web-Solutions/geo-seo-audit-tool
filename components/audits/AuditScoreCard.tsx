import { Calendar } from "lucide-react";

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
import type { Audit, AuditStatus } from "@/types";

export function AuditScoreCard({ audit }: { audit: Audit }) {
  const date = new Date(audit.created_at).toLocaleString();
  const isRunning = audit.status === "pending" || audit.status === "running";
  const progressTotal = audit.progress_total ?? 0;
  const indeterminateProgress = isRunning && progressTotal === 0;
  const retryLikely =
    audit.status === "pending" &&
    progressTotal > 0 &&
    audit.pages_crawled === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-xl">Audit results</CardTitle>
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
        {isRunning ? (
          <div className="flex flex-col gap-3">
            <ProgressBar
              label={
                retryLikely
                  ? "Retrying or scoring pages…"
                  : audit.status === "pending"
                    ? "Discovering URLs…"
                    : "Auditing pages…"
              }
              value={audit.pages_crawled}
              max={progressTotal}
              busy
              indeterminate={indeterminateProgress}
            />
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
