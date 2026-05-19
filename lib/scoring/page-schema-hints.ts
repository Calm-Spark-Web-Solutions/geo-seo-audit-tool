import type { AuditCheck } from "@/types";

/** Title/H1 text extracted from persisted audit checks for schema role inference. */
export interface PageSchemaHints {
  title?: string;
  h1?: string;
}

const H1_TEXT_RE = /H1 text:\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Pull title/H1 hints from deterministic check explanations (no extra DB fields).
 */
export function hintsFromAuditChecks(checks: AuditCheck[]): PageSchemaHints {
  const h1Check = checks.find((c) => c.key === "h1_count");
  let h1: string | undefined;
  if (h1Check?.explanation) {
    const m = h1Check.explanation.match(H1_TEXT_RE);
    const raw = m?.[1] ?? m?.[2];
    if (raw?.trim()) h1 = raw.trim();
  }
  return h1 ? { h1 } : {};
}
