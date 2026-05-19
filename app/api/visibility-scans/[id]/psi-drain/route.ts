import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { kickPsiDrainFireAndForget } from "@/lib/audit/runner-kick";
import {
  runPsiDrainPass,
  shouldChainPsiDrain,
} from "@/lib/audit/psi-retry";
import { observabilityLog } from "@/lib/observability/log";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "iad1";

const MAX_PASS_HEADER = 999;

function parsePassIndex(request: Request): number {
  const raw = request.headers.get("x-psi-drain-pass")?.trim();
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_PASS_HEADER);
}

/**
 * Background Lighthouse drain. One capped PSI pass per invocation; chains
 * itself when pages remain and the last pass recovered at least one.
 * Authenticated via `AUDIT_RUNNER_SECRET` (same as the audit runner).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const expected = process.env.AUDIT_RUNNER_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Runner not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-audit-runner-token")?.trim();
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const passIndex = parsePassIndex(request);
  const { id: auditId } = await context.params;
  const supabase = createServiceClient();

  const { data: audit, error: auditErr } = await supabase
    .from("audits")
    .select("id, community_id, status")
    .eq("id", auditId)
    .maybeSingle();

  if (auditErr || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  if (audit.status !== "complete") {
    return NextResponse.json(
      { error: "Audit is not complete", status: audit.status },
      { status: 409 },
    );
  }

  const pass = await runPsiDrainPass(supabase, auditId);
  const chain = shouldChainPsiDrain(passIndex, pass, pass.remaining);

  observabilityLog.info("psi_drain.pass_complete", {
    audit_id: auditId,
    pass_index: passIndex,
    ...pass,
    chain,
  });

  if (chain) {
    kickPsiDrainFireAndForget(auditId, passIndex + 1);
  }

  const cid = audit.community_id as string | undefined;
  if (cid) revalidatePath(`/communities/${cid}`);
  revalidatePath(`/visibility-scans/${auditId}`);

  return NextResponse.json({
    ok: true,
    passIndex,
    chain,
    ...pass,
  });
}
