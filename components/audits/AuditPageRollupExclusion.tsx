"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { setAuditPageExcludeFromRollup } from "@/app/(dashboard)/visibility-scans/[id]/pages/[pageId]/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuditPageRollupExclusion({
  auditId,
  pageId,
  excluded,
}: {
  auditId: string;
  pageId: string;
  excluded: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Audit averages</CardTitle>
        <CardDescription>
          Password-protected or gated URLs are detected when possible and omitted from community audit averages by default. You can also exclude this URL
          manually. Findings below are unchanged—only rollup scores on the community audit list are affected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-start gap-2 text-sm leading-snug">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-input"
            checked={excluded}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              void (async () => {
                setPending(true);
                try {
                  const r = await setAuditPageExcludeFromRollup(auditId, pageId, next);
                  if (!r.ok) toast.error(r.error ?? "Could not update");
                  else router.refresh();
                } finally {
                  setPending(false);
                }
              })();
            }}
          />
          <span>
            <span className="font-medium">Exclude this URL from audit SEO / GEO / overall averages</span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
