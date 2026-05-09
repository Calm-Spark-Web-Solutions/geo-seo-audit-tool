import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSP violation report sink. Browsers POST `application/csp-report` (or
 * `application/reports+json` for the newer Reporting API) when a directive
 * blocks a load. We log to stdout for now; once Sentry is wired up
 * (separate plan) this can pipe into structured capture.
 *
 * The endpoint is intentionally unauthenticated — browsers don't carry
 * auth on report deliveries — and the body is bounded so a malicious page
 * can't flood logs.
 */
const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (raw.length > MAX_BODY_BYTES) {
    raw = raw.slice(0, MAX_BODY_BYTES);
  }

  // Log compactly. Keep noise low: most violations come in bursts from a
  // single page load. We rely on log aggregation to dedupe by directive +
  // blocked-uri downstream.
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const report = (parsed["csp-report"] ?? parsed) as Record<string, unknown>;
    console.warn("[csp-report]", {
      directive: report["effective-directive"] ?? report["violated-directive"],
      blocked: report["blocked-uri"],
      document: report["document-uri"],
      sourceFile: report["source-file"],
      line: report["line-number"],
      sample: typeof report["script-sample"] === "string"
        ? String(report["script-sample"]).slice(0, 200)
        : undefined,
    });
  } catch {
    console.warn("[csp-report] (unparsed)", raw.slice(0, 500));
  }

  // 204 keeps the browser quiet; report endpoints conventionally return
  // no body.
  return new NextResponse(null, { status: 204 });
}
