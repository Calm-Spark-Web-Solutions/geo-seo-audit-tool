import { after } from "next/server";

import { devRunnerConsole } from "@/lib/audit/dev-runner-console";
import { observabilityLog } from "@/lib/observability/log";

/**
 * Resolve the public origin used to POST `/api/visibility-scans/[id]/run` from server
 * actions. Must match the deployed host so the audit runner is reachable
 * (never localhost on production builds unless you run the server locally).
 */
export function resolveSiteUrl(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return null;
}

/** Fire-and-forget kick so HTTP handlers return quickly; cron picks up if dropped. */
export function kickAuditRunnerFireAndForget(auditId: string): void {
  const siteUrl = resolveSiteUrl();
  const runnerSecret = process.env.AUDIT_RUNNER_SECRET?.trim();
  if (!siteUrl || !runnerSecret) {
    observabilityLog.warn("runner.kick.skipped", {
      auditId,
      missingSiteUrl: !siteUrl,
      missingRunnerSecret: !runnerSecret,
    });
    devRunnerConsole("kick skipped: missing site URL or AUDIT_RUNNER_SECRET", {
      auditId,
      missingSiteUrl: !siteUrl,
      missingRunnerSecret: !runnerSecret,
    });
    return;
  }
  devRunnerConsole("kick: POST runner", {
    auditId,
    target: `${siteUrl}/api/visibility-scans/${auditId}/run`,
  });

  // Deferred via after() so the fetch runs after the caller's response is
  // flushed. Without this, callers that follow up with redirect() abort the
  // request before the fetch hits the wire, so /run never receives the POST
  // and the job sits in audit_jobs.status = "queued" forever in dev (cron
  // recovers it in production).
  after(async () => {
    try {
      const res = await fetch(`${siteUrl}/api/visibility-scans/${auditId}/run`, {
        method: "POST",
        headers: {
          "x-audit-runner-token": runnerSecret,
          "content-type": "application/json",
        },
        cache: "no-store",
      });
      devRunnerConsole("kick: POST runner response", {
        auditId,
        status: res.status,
      });
      if (!res.ok) {
        observabilityLog.warn("runner.kick.non_2xx", {
          auditId,
          status: res.status,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      devRunnerConsole("kick: POST runner failed", { auditId, error: message });
      observabilityLog.warn("runner.kick.failed", { auditId, error: message });
      // cron tick will reap if the kick was dropped
    }
  });
}

export function isAuditRunnerConfigured(): boolean {
  const siteUrl = resolveSiteUrl();
  const runnerSecret = process.env.AUDIT_RUNNER_SECRET?.trim();
  return Boolean(siteUrl && runnerSecret);
}
