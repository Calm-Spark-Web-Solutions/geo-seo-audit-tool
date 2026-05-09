"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { saveCommunityManualChecklist } from "@/app/(dashboard)/communities/actions";
import { COMMUNITY_MANUAL_ITEMS } from "@/lib/checklists/community-manual";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CommunityManualResults, ManualVerificationStatus } from "@/types";

const STATUS_OPTIONS: ManualVerificationStatus[] = [
  "unreviewed",
  "pass",
  "warn",
  "fail",
];

function buildInitialState(
  saved: CommunityManualResults | null,
): Record<string, { status: ManualVerificationStatus; notes: string }> {
  const out: Record<string, { status: ManualVerificationStatus; notes: string }> =
    {};
  for (const item of COMMUNITY_MANUAL_ITEMS) {
    const row = saved?.[item.key];
    out[item.key] = {
      status: row?.status ?? "unreviewed",
      notes: row?.notes ?? "",
    };
  }
  return out;
}

export function CommunityManualChecklist({
  communityId,
  initialResults,
  variant = "default",
}: {
  communityId: string;
  initialResults: CommunityManualResults | null;
  /** Collapsed `<details>` by default — use on audit report pages only. */
  variant?: "default" | "collapsible";
}) {
  const [state, setState] = useState(() => buildInitialState(initialResults));
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof COMMUNITY_MANUAL_ITEMS>();
    for (const item of COMMUNITY_MANUAL_ITEMS) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, []);

  const setRow = (
    key: string,
    patch: Partial<{ status: ManualVerificationStatus; notes: string }>,
  ) => {
    setState((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const onSave = () => {
    const payload: CommunityManualResults = {};
    for (const item of COMMUNITY_MANUAL_ITEMS) {
      const row = state[item.key];
      payload[item.key] = {
        status: row.status,
        ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
      };
    }

    startTransition(async () => {
      const result = await saveCommunityManualChecklist(communityId, payload);
      if (result.ok) {
        toast.success("Expert checklist saved");
      } else {
        toast.error(result.error ?? "Could not save checklist");
      }
    });
  };

  const cardBody = (
    <>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Expert checklist (human sign-off)</CardTitle>
          <CardDescription>
            Human-reviewed items (Search Console, directories, backlinks, editorial quality). These sign-offs are stored per community and shown on PDFs
            — they are never used to calculate SEO/GEO/total scores (those come only from automated checks on each run). Stored per community; same answers
            repeat on audit reports until you change them here.
          </CardDescription>
        </div>
        <Button type="button" onClick={onSave} disabled={pending} size="sm">
          {pending ? "Saving…" : "Save checklist"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        {grouped.map(([category, items]) => (
          <section key={category} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">{category}</h3>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {items.map((item) => {
                const row = state[item.key];
                return (
                  <li key={item.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{item.label}</p>
                      {item.helper ? (
                        <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
                      ) : null}
                    </div>
                    <label className="sr-only" htmlFor={`status-${item.key}`}>
                      Status · {item.label}
                    </label>
                    <select
                      id={`status-${item.key}`}
                      className="h-9 w-full shrink-0 rounded-md border border-input bg-background px-3 text-sm sm:w-44"
                      value={row.status}
                      onChange={(e) =>
                        setRow(item.key, {
                          status: e.target.value as ManualVerificationStatus,
                        })
                      }
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/^\w/, (c) => c.toUpperCase())}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`notes-${item.key}`}>
                      Notes · {item.label}
                    </label>
                    <textarea
                      id={`notes-${item.key}`}
                      className="min-h-[2.75rem] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm sm:min-h-0 sm:min-w-[200px] sm:flex-1"
                      placeholder="Optional notes…"
                      value={row.notes}
                      onChange={(e) => setRow(item.key, { notes: e.target.value })}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CardContent>
    </>
  );

  if (variant === "collapsible") {
    return (
      <section id="expert-checklist" className="scroll-mt-6" aria-label="Expert checklist">
        <details className="group overflow-hidden rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/35 [&::-webkit-details-marker]:hidden">
            <ChevronDown
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="text-sm font-semibold text-foreground">
                Expert checklist (human sign-off)
              </span>
              <span className="text-xs font-normal leading-snug text-muted-foreground">
                Expand to edit · optional · does not affect automated scores
              </span>
            </span>
          </summary>
          <Card className="rounded-none border-0 border-t shadow-none">{cardBody}</Card>
        </details>
      </section>
    );
  }

  return (
    <Card id="expert-checklist">
      {cardBody}
    </Card>
  );
}
