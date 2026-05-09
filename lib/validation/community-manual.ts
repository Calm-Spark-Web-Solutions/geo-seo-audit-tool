import { z } from "zod";

import { COMMUNITY_MANUAL_ITEMS } from "@/lib/checklists/community-manual";
import type { CommunityManualResults } from "@/types";

/** Keys permitted in `manual_check_results` — trims removed template rows on save. */
export const ALLOWED_COMMUNITY_MANUAL_KEYS: ReadonlySet<string> = new Set(
  COMMUNITY_MANUAL_ITEMS.map((i) => i.key),
);

const entrySchema = z.object({
  status: z.enum(["unreviewed", "pass", "warn", "fail"]),
  notes: z.string().max(4000).optional(),
  updated_at: z.string().optional(),
});

const payloadSchema = z.record(z.string(), entrySchema);

export function sanitizeCommunityManualResults(
  raw: unknown,
): { ok: true; data: CommunityManualResults } | { ok: false; error: string } {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid checklist data." };
  }
  const out: CommunityManualResults = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (!ALLOWED_COMMUNITY_MANUAL_KEYS.has(k)) continue;
    out[k] = v;
  }
  return { ok: true, data: out };
}
