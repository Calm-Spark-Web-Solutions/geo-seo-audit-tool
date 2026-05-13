import type { AuditCheck, AuditPage } from "@/types";

export type ScanInternalLinkRow = {
  fromUrl: string;
  toUrl: string;
  anchor?: string;
};

/**
 * Aggregate internal link samples from each page’s persisted GEO checks.
 * Each page only stores up to `AUDIT_EVIDENCE_MAX_ITEMS` unique targets (see
 * deterministic scoring); this is a union of those samples, not every href.
 */
export function collectInternalLinkRowsFromPages(
  pages: AuditPage[],
): ScanInternalLinkRow[] {
  const out: ScanInternalLinkRow[] = [];
  for (const page of pages) {
    const geo = page.geo_results;
    if (!Array.isArray(geo)) continue;
    const check = geo.find((c: AuditCheck) => c.key === "internal_links");
    const items = check?.evidence?.items;
    if (!items?.length) continue;
    const fromUrl = page.url;
    for (const item of items) {
      if (item.type !== "link") continue;
      out.push({
        fromUrl,
        toUrl: item.url,
        ...(item.anchor ? { anchor: item.anchor } : {}),
      });
    }
  }
  return out;
}
