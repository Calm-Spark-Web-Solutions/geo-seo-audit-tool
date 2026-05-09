import type { AuditCheck, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

function item(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    category: "Structured data (offline)",
    pillar: "GEO",
  };
}

function visitObjects(node: unknown, cb: (o: Record<string, unknown>) => void): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) visitObjects(n, cb);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  cb(o);
  for (const v of Object.values(o)) visitObjects(v, cb);
}

function typesOf(o: Record<string, unknown>): string[] {
  const t = o["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function hasAddressLike(o: Record<string, unknown>): boolean {
  if ("address" in o && o.address) return true;
  if ("geo" in o && o.geo) return true;
  return false;
}

function hasNameLike(o: Record<string, unknown>): boolean {
  return Boolean(
    (typeof o.name === "string" && o.name.trim()) ||
      (typeof o.legalName === "string" && o.legalName.trim()),
  );
}

function hasWebsiteUrlLike(o: Record<string, unknown>): boolean {
  return Boolean(
    (typeof o.url === "string" && o.url.trim()) ||
      o.potentialAction != null,
  );
}

/**
 * Offline JSON-LD heuristics (no external Schema.org Validator calls).
 * Complements JSON syntax + @type coverage in deterministic.ts.
 */
export function structuredDataOfflineHeuristics(
  parsedBlocks: unknown[],
): AuditCheck[] {
  if (parsedBlocks.length === 0) return [];

  let orgMissingName = 0;
  let websiteMissingUrl = 0;
  let localMissingAddress = 0;
  let rootMissingContext = 0;

  for (const block of parsedBlocks) {
    if (!block || typeof block !== "object") continue;
    const o = block as Record<string, unknown>;
    const hasGraph = Array.isArray(o["@graph"]);
    if (hasGraph && !("@context" in o)) {
      rootMissingContext += 1;
    } else if (!hasGraph && "@type" in o && !("@context" in o)) {
      rootMissingContext += 1;
    }
  }

  for (const block of parsedBlocks) {
    visitObjects(block, (o) => {
      const ts = typesOf(o);
      for (const t of ts) {
        if (t === "Organization" || t === "Corporation") {
          if (!hasNameLike(o)) orgMissingName += 1;
        }
        if (t === "WebSite") {
          if (!hasWebsiteUrlLike(o)) websiteMissingUrl += 1;
        }
        if (t === "LocalBusiness" || t === "MedicalOrganization") {
          if (!hasAddressLike(o)) localMissingAddress += 1;
        }
      }
    });
  }

  const out: AuditCheck[] = [];

  if (rootMissingContext > 0) {
    out.push(
      item(
        "schema_ld_context_hint",
        "JSON-LD @context (offline)",
        "warn",
        `${rootMissingContext} top-level JSON-LD object(s) lack @schema.org context linkage; validators expect @context pointing at https://schema.org (JSON-LD 1.0 best practice).`,
      ),
    );
  }

  if (orgMissingName > 0) {
    out.push(
      item(
        "schema_org_name_offline",
        "Organization name (offline)",
        "warn",
        `Found ${orgMissingName} Organization/Corporation node(s) without a clear name or legalName string.`,
      ),
    );
  }

  if (websiteMissingUrl > 0) {
    out.push(
      item(
        "schema_website_url_offline",
        "WebSite URL (offline)",
        "warn",
        `Found ${websiteMissingUrl} WebSite node(s) without url or potentialAction — add canonical site URL when possible.`,
      ),
    );
  }

  if (localMissingAddress > 0) {
    out.push(
      item(
        "schema_local_address_offline",
        "Local entity address (offline)",
        "warn",
        `Found ${localMissingAddress} LocalBusiness/MedicalOrganization node(s) without address or geo — NAP clarity matters for local SEO.`,
      ),
    );
  }

  return out;
}
