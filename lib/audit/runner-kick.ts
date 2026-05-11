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
  if (!siteUrl || !runnerSecret) return;
  void fetch(`${siteUrl}/api/visibility-scans/${auditId}/run`, {
    method: "POST",
    headers: {
      "x-audit-runner-token": runnerSecret,
      "content-type": "application/json",
    },
    cache: "no-store",
  }).catch(() => {
    /* swallow: cron tick will reap if the kick was dropped */
  });
}

export function isAuditRunnerConfigured(): boolean {
  const siteUrl = resolveSiteUrl();
  const runnerSecret = process.env.AUDIT_RUNNER_SECRET?.trim();
  return Boolean(siteUrl && runnerSecret);
}
