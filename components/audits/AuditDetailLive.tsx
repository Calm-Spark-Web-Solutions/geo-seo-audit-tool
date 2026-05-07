"use client";

import { FileSearch } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuditPageRow } from "@/components/audits/AuditPageRow";
import { AuditScoreCard } from "@/components/audits/AuditScoreCard";
import { EmptyState } from "@/components/layout/EmptyState";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Audit, AuditPage } from "@/types";

const POLL_INTERVAL_MS = 2000;

function isTerminal(status: Audit["status"]): boolean {
  return status === "complete" || status === "failed";
}

export function AuditDetailLive({
  initialAudit,
  initialPages,
}: {
  initialAudit: Audit;
  initialPages: AuditPage[];
}) {
  const [audit, setAudit] = useState<Audit>(initialAudit);
  const [pages, setPages] = useState<AuditPage[]>(initialPages);
  const stoppedRef = useRef(isTerminal(initialAudit.status));

  useEffect(() => {
    if (stoppedRef.current) return;

    let cancelled = false;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const res = await fetch(`/api/audits/${initialAudit.id}/snapshot`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          audit: Audit;
          pages: AuditPage[];
        };
        if (cancelled) return;
        setAudit(json.audit);
        setPages(json.pages);
        if (isTerminal(json.audit.status)) {
          stoppedRef.current = true;
          clearInterval(interval);
        }
      } catch {
        /* network blip; next tick will retry */
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    void tick();

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [initialAudit.id]);

  return (
    <>
      <AuditScoreCard audit={audit} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pages</h2>
        {pages.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No page results yet"
            description={
              audit.status === "failed"
                ? "This audit did not complete successfully. Try running a new audit from the community."
                : audit.status === "running" || audit.status === "pending"
                  ? "Pages will stream in here as they are scored."
                  : "No HTML pages were fetched (empty crawl or all fetches failed)."
            }
          />
        ) : (
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Audited URLs</CardTitle>
              <CardDescription>
                Expand a row for checks and suggested fixes.
              </CardDescription>
            </CardHeader>
            <div className="px-4 pb-2 sm:px-6">
              {pages.map((p) => (
                <AuditPageRow key={p.id} page={p} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
