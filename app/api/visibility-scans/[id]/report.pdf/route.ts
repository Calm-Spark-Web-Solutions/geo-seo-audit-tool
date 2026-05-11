import { NextResponse } from "next/server";

import { userAllowedPaidProductFeatures } from "@/lib/billing/subscription-access";
import { loadAuditPdfPayload, renderAuditPdfBuffer } from "@/lib/pdf/render";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Literal required by Next.js's route-segment-config analyzer.
// See lib/config/region.ts for region options.
export const preferredRegion = "iad1";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeOn = isStripeConfigured();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!userAllowedPaidProductFeatures(stripeOn, subRow)) {
    return NextResponse.json(
      {
        error:
          "Subscription required. Open Settings to subscribe before downloading PDFs.",
      },
      { status: 403 },
    );
  }

  const payload = await loadAuditPdfPayload(supabase, id);
  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await renderAuditPdfBuffer(payload);
  } catch (err) {
    // The user message stays generic, but the underlying cause is logged
    // server-side so Turbopack/Node bundling regressions stop being silent.
    console.error("renderAuditPdfBuffer failed", {
      auditId: id,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "Failed to render PDF" },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="visibility-scan-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
