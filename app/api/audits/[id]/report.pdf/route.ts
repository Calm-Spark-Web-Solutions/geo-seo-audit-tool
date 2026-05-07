import { NextResponse } from "next/server";

import { loadAuditPdfPayload, renderAuditPdfBuffer } from "@/lib/pdf/render";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  const payload = await loadAuditPdfPayload(supabase, id);
  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await renderAuditPdfBuffer(payload);
  } catch {
    return NextResponse.json(
      { error: "Failed to render PDF" },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="audit-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
