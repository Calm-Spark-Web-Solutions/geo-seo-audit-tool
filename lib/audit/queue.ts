import type { SupabaseClient } from "@supabase/supabase-js";

import { markAuditFailed, runAudit } from "@/lib/audit/run";
import { observabilityLog } from "@/lib/observability/log";

/** Lease window. Must exceed the runner route's `maxDuration` (300 s). */
const LEASE_MS = 8 * 60 * 1000;

/** Max jobs the cron tick claims per call (avoids overlap with the runner kick). */
const TICK_BATCH = 3;

/** PostgREST unique-violation code, fired by the partial-unique index. */
const PG_UNIQUE_VIOLATION = "23505";

interface JobRow {
  id: string;
  audit_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  lease_until: string | null;
}

/**
 * Idempotently enqueue a job for an audit. The unique partial index on
 * `audit_jobs(audit_id) where status in ('queued','running')` makes a second
 * call a no-op while the first job is still pending. Should be called from
 * the user-cookie Supabase client at audit-start time.
 */
export async function enqueueAudit(
  supabase: SupabaseClient,
  auditId: string,
): Promise<void> {
  const { error } = await supabase
    .from("audit_jobs")
    .insert({ audit_id: auditId, status: "queued" });
  if (error && error.code !== PG_UNIQUE_VIOLATION) {
    throw new Error(`Failed to enqueue audit job: ${error.message}`);
  }
}

async function loadCommunityUrl(
  supabase: SupabaseClient,
  auditId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("audits")
    .select("community_id")
    .eq("id", auditId)
    .maybeSingle();
  if (!data?.community_id) return null;
  const { data: community } = await supabase
    .from("communities")
    .select("website_url")
    .eq("id", data.community_id)
    .maybeSingle();
  return community?.website_url ?? null;
}

async function tryClaim(
  supabase: SupabaseClient,
  job: JobRow,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  const update = {
    status: "running",
    lease_until: leaseUntil,
    attempts: job.attempts + 1,
    updated_at: nowIso,
  };

  // Path 1: claim a freshly-queued job.
  const queued = await supabase
    .from("audit_jobs")
    .update(update)
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (queued.data) return true;

  // Path 2: re-claim a `running` job whose lease has expired (the previous
  // runner was killed / crashed).
  const reclaimed = await supabase
    .from("audit_jobs")
    .update(update)
    .eq("id", job.id)
    .eq("status", "running")
    .lt("lease_until", nowIso)
    .select("id")
    .maybeSingle();
  return Boolean(reclaimed.data);
}

async function finalizeCompleted(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  await supabase
    .from("audit_jobs")
    .update({
      status: "completed",
      lease_until: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function finalizeCancelled(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  await supabase
    .from("audit_jobs")
    .update({
      status: "cancelled",
      lease_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

async function finalizeErrored(
  supabase: SupabaseClient,
  job: JobRow,
  auditId: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const truncated = message.slice(0, 1000);
  const newAttempts = job.attempts + 1;
  const exhausted = newAttempts >= job.max_attempts;
  const nowIso = new Date().toISOString();

  observabilityLog.error("audit.job.error", {
    auditId,
    jobId: job.id,
    attempt: newAttempts,
    maxAttempts: job.max_attempts,
    exhausted,
    error: truncated,
  });

  if (exhausted) {
    await supabase
      .from("audit_jobs")
      .update({
        status: "failed",
        lease_until: null,
        last_error: truncated,
        updated_at: nowIso,
      })
      .eq("id", job.id);
    try {
      await markAuditFailed(supabase, auditId);
    } catch {
      /* swallow: audit row may already be in a terminal state */
    }
    return;
  }

  // Retry path: requeue the job and reset audits.status so the UI does not
  // flash "failed" between attempts. The runner sets status back to
  // "running" at the start of the next attempt.
  await supabase
    .from("audit_jobs")
    .update({
      status: "queued",
      lease_until: null,
      last_error: truncated,
      updated_at: nowIso,
    })
    .eq("id", job.id);
  await supabase
    .from("audits")
    .update({ status: "pending", progress_total: null })
    .eq("id", auditId);
}

async function readAuditStatus(
  supabase: SupabaseClient,
  auditId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("audits")
    .select("status")
    .eq("id", auditId)
    .maybeSingle();
  return (data?.status as string | undefined) ?? null;
}

async function runJob(
  supabase: SupabaseClient,
  job: JobRow,
): Promise<void> {
  const websiteUrl = await loadCommunityUrl(supabase, job.audit_id);
  if (!websiteUrl) {
    await finalizeErrored(
      supabase,
      job,
      job.audit_id,
      new Error("Community / website not found"),
    );
    return;
  }

  try {
    await runAudit({ supabase, auditId: job.audit_id, websiteUrl });
    // Trust the post-run audits.status: runAudit sets `complete` on success,
    // returns early without flipping status when it observes `cancelled`,
    // and may have set `failed` itself on a bad URL.
    const status = await readAuditStatus(supabase, job.audit_id);
    if (status === "cancelled") {
      await finalizeCancelled(supabase, job.id);
    } else if (status === "complete") {
      await finalizeCompleted(supabase, job.id);
    } else {
      // Defensive: runAudit returned without throwing, but didn't reach a
      // terminal status. Treat as an error so retry kicks in.
      await finalizeErrored(
        supabase,
        job,
        job.audit_id,
        new Error("Runner returned without terminal status"),
      );
    }
  } catch (err) {
    await finalizeErrored(supabase, job, job.audit_id, err);
  }
}

/**
 * Lease + run the most recent non-terminal job for the given audit. Used by
 * the manual kick path (POST /api/visibility-scans/[id]/run).
 *
 * Returns:
 *   - "claimed"  — we won the lease and ran (success or failure recorded)
 *   - "skipped"  — another runner held the lease; do nothing
 *   - "missing"  — no queued/running job exists for this audit
 */
export async function claimAndRunOne(
  supabase: SupabaseClient,
  auditId: string,
): Promise<"claimed" | "skipped" | "missing"> {
  const { data, error } = await supabase
    .from("audit_jobs")
    .select("id, audit_id, status, attempts, max_attempts, lease_until")
    .eq("audit_id", auditId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return "missing";
  const job = data as JobRow;

  const won = await tryClaim(supabase, job);
  if (!won) return "skipped";

  await runJob(supabase, { ...job, attempts: job.attempts + 1 });
  return "claimed";
}

/**
 * Cron sweep. Looks for queued jobs and `running` jobs whose lease expired,
 * claims up to TICK_BATCH of them, and runs each in sequence. Stays well
 * inside the cron route's 300 s budget when sized at TICK_BATCH = 3.
 */
export async function tickQueue(
  supabase: SupabaseClient,
): Promise<{ claimed: number; reaped: number; failed: number }> {
  const nowIso = new Date().toISOString();
  const orFilter = `status.eq.queued,and(status.eq.running,lease_until.lt.${nowIso})`;

  const { data: candidates, error } = await supabase
    .from("audit_jobs")
    .select("id, audit_id, status, attempts, max_attempts, lease_until")
    .or(orFilter)
    .order("created_at", { ascending: true })
    .limit(TICK_BATCH);

  if (error || !candidates) {
    return { claimed: 0, reaped: 0, failed: error ? 1 : 0 };
  }

  let claimed = 0;
  let reaped = 0;
  let failed = 0;

  for (const raw of candidates) {
    const job = raw as JobRow;
    if (job.status === "running") reaped += 1;
    const won = await tryClaim(supabase, job);
    if (!won) continue;
    try {
      await runJob(supabase, { ...job, attempts: job.attempts + 1 });
      claimed += 1;
    } catch {
      failed += 1;
    }
  }

  return { claimed, reaped, failed };
}
