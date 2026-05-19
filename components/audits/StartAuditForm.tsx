"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useActionState } from "react";

import {
  startAudit,
  type StartAuditFormState,
} from "@/app/(dashboard)/communities/[id]/new-visibility-scan/actions";
import { StartAuditButton } from "@/components/audits/StartAuditButton";

const initialState: StartAuditFormState = { ok: true };

// Above this many pages we surface a warning that the runner can hit the
// 300 s function timeout with all scoring layers enabled.
const RUNTIME_WARN_THRESHOLD = 300;
// Above this many pages we add a soft "audits scale linearly" note so the
// user knows what they signed up for.
const COST_WARN_THRESHOLD = 50;
// Per-page wall-clock estimate (deterministic + PSI + Anthropic). Tuned to
// match observed runs at SCORE_CONCURRENCY = 3.
const PER_PAGE_SECONDS = 4;
const SCORE_CONCURRENCY = 3;

export interface ShardOption {
  url: string;
  label: string;
  /** Visible URL count (after the page-side preview ceiling). */
  urlCount: number;
  /** Total URLs the shard's sitemap declared, before truncation. */
  totalCount: number;
  defaultChecked: boolean;
  urls: string[];
}

export interface PageRosterPreview {
  /** Already-tracked URLs for the community. Rescans never count toward caps. */
  trackedUrls: string[];
  /** Caps from the active plan; null = unlimited for that knob. */
  newMonthlyCap: number | null;
  rosterCap: number | null;
  rosterUsed: number;
  newAddedThisMonth: number;
  /** True when billing enforcement is bypassed (no Stripe, dev, partner). */
  unlimited: boolean;
}

interface StartAuditFormProps {
  communityId: string;
  shards: ShardOption[];
  /** When true, app enforces active/trialing subscription for audits. */
  stripeBillingEnabled?: boolean;
  /** User may start a paid audit run (server action re-checks). */
  paidAccess?: boolean;
  /** Snapshot of this community's roster + plan limits for the in-form preview. */
  pageRoster?: PageRosterPreview;
}

function normalizeForRoster(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function StartAuditForm({
  communityId,
  shards,
  stripeBillingEnabled = false,
  paidAccess = true,
  pageRoster,
}: StartAuditFormProps) {
  const [state, formAction] = useActionState(startAudit, initialState);

  const trackedSet = useMemo(() => {
    if (!pageRoster) return new Set<string>();
    return new Set(pageRoster.trackedUrls);
  }, [pageRoster]);

  // Selection: per-shard set of selected URLs.
  // We re-derive this when shards change identity (page navigation),
  // otherwise it's purely client-side after first paint.
  const [selection, setSelection] = useState<Record<string, Set<string>>>(
    () => {
      const init: Record<string, Set<string>> = {};
      for (const shard of shards) {
        init[shard.url] = new Set();
      }
      return init;
    },
  );

  // Distinct selected URLs across all shards. Same URL listed in two
  // shards (rare but possible) only counts once.
  const selectedTotal = useMemo(() => {
    const merged = new Set<string>();
    for (const shard of shards) {
      const set = selection[shard.url];
      if (!set) continue;
      for (const u of set) merged.add(u);
    }
    return merged.size;
  }, [shards, selection]);

  const estimatedSeconds = Math.max(
    PER_PAGE_SECONDS,
    Math.ceil(
      (Math.max(selectedTotal, 1) * PER_PAGE_SECONDS) / SCORE_CONCURRENCY,
    ),
  );
  const runtimeLabel = formatDuration(estimatedSeconds);

  const noneSelected = shards.length > 0 && selectedTotal === 0;

  const showRuntimeWarning =
    !noneSelected && selectedTotal > RUNTIME_WARN_THRESHOLD;
  const showCostNote =
    !showRuntimeWarning &&
    !noneSelected &&
    selectedTotal > COST_WARN_THRESHOLD;

  // List of selected URLs (deduped) for hidden inputs at submit time.
  const selectedUrls = useMemo(() => {
    const merged = new Set<string>();
    for (const shard of shards) {
      const set = selection[shard.url];
      if (!set) continue;
      for (const u of set) merged.add(u);
    }
    return Array.from(merged);
  }, [shards, selection]);

  const newPagesPreview = useMemo(() => {
    if (!pageRoster || pageRoster.unlimited) return null;
    let newCount = 0;
    let trackedCount = 0;
    for (const raw of selectedUrls) {
      const n = normalizeForRoster(raw) ?? raw;
      if (trackedSet.has(n)) trackedCount += 1;
      else newCount += 1;
    }
    const remainingMonthly =
      pageRoster.newMonthlyCap === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, pageRoster.newMonthlyCap - pageRoster.newAddedThisMonth);
    const remainingRoster =
      pageRoster.rosterCap === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, pageRoster.rosterCap - pageRoster.rosterUsed);
    const slots = Math.min(remainingMonthly, remainingRoster);
    const overBy = Math.max(0, newCount - slots);
    return {
      newCount,
      trackedCount,
      remainingMonthly,
      remainingRoster,
      overBy,
    };
  }, [pageRoster, selectedUrls, trackedSet]);

  // Shards with at least one URL selected — submitted as analytics metadata.
  const activeShardUrls = useMemo(() => {
    const out: string[] = [];
    for (const shard of shards) {
      if ((selection[shard.url]?.size ?? 0) > 0) out.push(shard.url);
    }
    return out;
  }, [shards, selection]);

  const subscriptionBlocked = stripeBillingEnabled && !paidAccess;
  const overAllowance = (newPagesPreview?.overBy ?? 0) > 0;
  const submitDisabled = noneSelected || subscriptionBlocked || overAllowance;

  const allowanceSlots =
    pageRoster && !pageRoster.unlimited && newPagesPreview
      ? Math.min(
          Number.isFinite(newPagesPreview.remainingMonthly)
            ? newPagesPreview.remainingMonthly
            : Number.POSITIVE_INFINITY,
          Number.isFinite(newPagesPreview.remainingRoster)
            ? newPagesPreview.remainingRoster
            : Number.POSITIVE_INFINITY,
        )
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="community_id" value={communityId} />

      {pageRoster && !pageRoster.unlimited ? (
        <div
          role="status"
          className={
            overAllowance
              ? "rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
              : "rounded-lg border border-border bg-card p-4 text-sm"
          }
        >
          <p className="font-medium text-foreground">Pre-scan summary</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li>
              <span className="text-foreground">
                {selectedTotal.toLocaleString()} URL
                {selectedTotal === 1 ? "" : "s"}
              </span>{" "}
              selected · estimated runtime ~{runtimeLabel}
            </li>
            {newPagesPreview ? (
              <li>
                <span className="text-foreground">
                  {newPagesPreview.newCount.toLocaleString()} new
                </span>{" "}
                and{" "}
                <span className="text-foreground">
                  {newPagesPreview.trackedCount.toLocaleString()} rescans
                </span>{" "}
                (rescans do not count toward caps)
              </li>
            ) : null}
            {allowanceSlots !== null && Number.isFinite(allowanceSlots) ? (
              <li>
                You can add up to{" "}
                <span className="font-medium text-foreground">
                  {allowanceSlots.toLocaleString()}
                </span>{" "}
                new page{allowanceSlots === 1 ? "" : "s"} on this plan right
                now
                {newPagesPreview && newPagesPreview.overBy > 0 ? (
                  <span className="text-destructive-foreground">
                    {" "}
                    — selection is {newPagesPreview.overBy.toLocaleString()}{" "}
                    over that limit
                  </span>
                ) : null}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {subscriptionBlocked ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          <span className="font-medium text-foreground">
            Subscription required
          </span>
          <span>
            RankLume needs an active or trialing plan on your account to run
            new visibility scans.
          </span>
          <Link
            href="/settings"
            className="w-fit font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            Open Settings → Plans & billing
          </Link>
        </div>
      ) : null}

      {shards.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Categories</legend>
          <p className="text-xs text-muted-foreground">
            Detected from the site&apos;s sitemap. Expand a category to pick
            individual URLs; toggle the category checkbox to select them all.
          </p>
          <div className="mt-1 flex flex-col gap-2">
            {shards.map((shard) => (
              <ShardRow
                key={shard.url}
                shard={shard}
                selected={selection[shard.url] ?? new Set()}
                onChange={(next) =>
                  setSelection((prev) => ({ ...prev, [shard.url]: next }))
                }
              />
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              No sitemap categories detected — the runner will fall back to
              a same-origin crawl starting at the homepage.
            </span>
          </span>
        </div>
      )}

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Plan: {selectedTotal.toLocaleString()} URL
          {selectedTotal === 1 ? "" : "s"} selected
        </span>
        {" · "}
        estimated runtime ~{runtimeLabel}
      </div>

      {newPagesPreview ? (
        <div
          className={
            newPagesPreview.overBy > 0
              ? "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground"
              : "rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
          }
        >
          <span className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-medium text-foreground">
                {newPagesPreview.newCount.toLocaleString()} new
              </strong>{" "}
              ·{" "}
              <strong className="font-medium text-foreground">
                {newPagesPreview.trackedCount.toLocaleString()} rescans
              </strong>{" "}
              of tracked pages.{" "}
              {pageRoster?.newMonthlyCap !== null ? (
                <>
                  New pages remaining this month:{" "}
                  <strong className="font-medium text-foreground">
                    {Number.isFinite(newPagesPreview.remainingMonthly)
                      ? newPagesPreview.remainingMonthly
                      : "∞"}
                  </strong>
                  .{" "}
                </>
              ) : null}
              {pageRoster?.rosterCap !== null ? (
                <>
                  Roster slots remaining:{" "}
                  <strong className="font-medium text-foreground">
                    {Number.isFinite(newPagesPreview.remainingRoster)
                      ? newPagesPreview.remainingRoster
                      : "∞"}
                  </strong>
                  .{" "}
                </>
              ) : null}
              {newPagesPreview.overBy > 0 ? (
                <span className="block pt-1 font-medium text-destructive-foreground">
                  Selection exceeds your allowance by{" "}
                  {newPagesPreview.overBy.toLocaleString()} new page
                  {newPagesPreview.overBy === 1 ? "" : "s"}. Remove some new
                  URLs or upgrade your plan.
                </span>
              ) : null}
            </span>
          </span>
        </div>
      ) : null}

      {showRuntimeWarning ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Heads up:</strong> auditing more
            than {RUNTIME_WARN_THRESHOLD} URLs with all scoring layers enabled
            often exceeds the 300 s function timeout, which causes the run to
            be retried by the queue. Consider selecting fewer URLs.
          </span>
        </div>
      ) : showCostNote ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            PSI and Anthropic calls run per-page, so cost and runtime scale
            linearly with pages crawled.
          </span>
        </div>
      ) : null}

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      {noneSelected ? (
        <p className="text-xs text-destructive">
          Select at least one URL to start a visibility scan.
        </p>
      ) : null}

      {/* Hidden inputs that actually carry the selection to the action. */}
      {selectedUrls.map((u) => (
        <input
          key={`page-${u}`}
          type="hidden"
          name="page_urls"
          value={u}
        />
      ))}
      {activeShardUrls.map((u) => (
        <input
          key={`shard-${u}`}
          type="hidden"
          name="shard_urls"
          value={u}
        />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <StartAuditButton disabled={submitDisabled} />
      </div>
    </form>
  );
}

interface ShardRowProps {
  shard: ShardOption;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

function ShardRow({ shard, selected, onChange }: ShardRowProps) {
  const allChecked = selected.size === shard.urls.length && shard.urls.length > 0;
  const noneChecked = selected.size === 0;

  // <input type="checkbox"> indeterminate is a DOM property, not an
  // attribute, so it has to be set imperatively after each render.
  const headerRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.indeterminate = !allChecked && !noneChecked;
    }
  }, [allChecked, noneChecked]);

  const truncated = shard.totalCount > shard.urls.length;
  const headerId = `shard-${slugify(shard.url)}`;

  const handleHeaderToggle = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onChange(new Set(shard.urls));
    } else {
      onChange(new Set());
    }
  };

  const toggleUrl = (url: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(url);
    else next.delete(url);
    onChange(next);
  };

  return (
    <details className="group rounded-md border border-border bg-card open:bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/40">
        <span className="flex items-center gap-2">
          <ChevronRight
            className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90"
            aria-hidden
          />
          <input
            ref={headerRef}
            id={headerId}
            type="checkbox"
            checked={allChecked}
            onChange={handleHeaderToggle}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-border accent-foreground"
            aria-label={`Toggle all URLs in ${shard.label}`}
          />
          <span className="font-medium">{shard.label}</span>
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {selected.size.toLocaleString()} / {shard.urls.length.toLocaleString()}
            {truncated ? ` of ${shard.totalCount.toLocaleString()}` : ""} URL
            {shard.urls.length === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(new Set(shard.urls));
              }}
              disabled={allChecked}
            >
              All
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(new Set());
              }}
              disabled={noneChecked}
            >
              Clear
            </button>
          </span>
        </span>
      </summary>

      <div className="border-t border-border px-3 py-2">
        {shard.urls.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            No URLs in this category.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto pr-1">
            {shard.urls.map((u) => {
              const id = `${headerId}-${slugify(u)}`;
              const path = pathOf(u);
              return (
                <li key={u}>
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/40"
                    title={u}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={selected.has(u)}
                      onChange={(e) => toggleUrl(u, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border accent-foreground"
                    />
                    <span className="truncate font-mono text-xs">
                      {path}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {truncated ? (
          <p className="mt-2 border-t border-dashed border-border pt-2 text-xs text-muted-foreground">
            Showing first {shard.urls.length.toLocaleString()} of{" "}
            {shard.totalCount.toLocaleString()} URLs in this category. Audits
            hard-cap at 1,000 pages — narrow the category or run multiple
            audits to cover the rest.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname || "/";
    return u.search ? `${path}${u.search}` : path;
  } catch {
    return url;
  }
}

function slugify(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}
