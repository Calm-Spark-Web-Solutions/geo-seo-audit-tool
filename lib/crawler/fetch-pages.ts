import { observabilityLog } from "@/lib/observability/log";
import type { AuditFetchFailure } from "@/types";

import { mapWithConcurrency, sleep } from "./concurrency";
import {
  tryFetchPageWithMeta,
  type FetchPageFailureReason,
  type PageFetchMeta,
} from "./fetch";
import {
  DEFAULT_USER_AGENT,
  preferTrailingSlashFetchUrl,
} from "./normalize";

/** Per-page wall clock during the polite fetch phase (includes redirect hops). */
export const PAGE_FETCH_TIMEOUT_MS = 15_000;
/** Longer budget for the sequential salvage pass after polite fetch. */
export const SALVAGE_FETCH_TIMEOUT_MS = 22_000;
/** Max in-flight HTML fetches (typical audits are single-origin). */
export const ORIGIN_FETCH_CONCURRENCY = 2;
const ORIGIN_FETCH_JITTER_MS_MIN = 150;
const ORIGIN_FETCH_JITTER_MS_MAX = 250;

export interface PageWork {
  url: string;
  html: string;
  meta: PageFetchMeta;
}

export interface FetchAllHtmlResult {
  work: PageWork[];
  failures: AuditFetchFailure[];
  salvageRecovered: number;
}

type FetchAttemptResult =
  | {
      url: string;
      html: string;
      meta: PageFetchMeta;
      failure: null;
    }
  | {
      url: string;
      html: null;
      meta: null;
      failure: AuditFetchFailure;
    };

async function originFetchJitter(): Promise<void> {
  const span = ORIGIN_FETCH_JITTER_MS_MAX - ORIGIN_FETCH_JITTER_MS_MIN;
  const ms = ORIGIN_FETCH_JITTER_MS_MIN + Math.floor(Math.random() * span);
  await sleep(ms);
}

async function fetchOnePage(
  url: string,
  timeoutMs: number,
): Promise<FetchAttemptResult> {
  const fetchUrl = preferTrailingSlashFetchUrl(url);
  const outcome = await tryFetchPageWithMeta(fetchUrl, {
    timeoutMs,
    userAgent: DEFAULT_USER_AGENT,
  });
  if (outcome.ok) {
    return {
      url,
      html: outcome.html,
      meta: outcome.meta,
      failure: null,
    };
  }
  return {
    url,
    html: null,
    meta: null,
    failure: {
      url,
      reason: outcome.reason as FetchPageFailureReason,
    },
  };
}

function partitionAttempts(attempts: FetchAttemptResult[]): {
  work: PageWork[];
  failures: AuditFetchFailure[];
} {
  const work: PageWork[] = [];
  const failures: AuditFetchFailure[] = [];
  for (const p of attempts) {
    if (p.html && p.meta) {
      work.push({ url: p.url, html: p.html, meta: p.meta });
    } else if (p.failure) {
      failures.push(p.failure);
    }
  }
  return { work, failures };
}

/**
 * Sequential salvage pass: one URL at a time with a longer timeout so slow
 * hosts are not competing with parallel polite-fetch workers.
 */
export async function salvageFailedPageFetches(
  failures: AuditFetchFailure[],
): Promise<{ work: PageWork[]; failures: AuditFetchFailure[] }> {
  const work: PageWork[] = [];
  const stillFailed: AuditFetchFailure[] = [];

  for (const failure of failures) {
    const result = await fetchOnePage(failure.url, SALVAGE_FETCH_TIMEOUT_MS);
    if (result.html && result.meta) {
      work.push({ url: result.url, html: result.html, meta: result.meta });
    } else if (result.failure) {
      stillFailed.push(result.failure);
    }
  }

  return { work, failures: stillFailed };
}

/**
 * Polite HTML fetch (low concurrency + jitter) then sequential salvage for
 * any URL that failed in phase A.
 */
export async function fetchAllHtmlForAudit(
  urls: string[],
): Promise<FetchAllHtmlResult> {
  const politeAttempts = await mapWithConcurrency(
    urls,
    ORIGIN_FETCH_CONCURRENCY,
    async (url) => {
      await originFetchJitter();
      return fetchOnePage(url, PAGE_FETCH_TIMEOUT_MS);
    },
  );

  const polite = partitionAttempts(politeAttempts);
  let work = polite.work;
  let failures = polite.failures;

  let salvageRecovered = 0;
  if (failures.length > 0) {
    const salvaged = await salvageFailedPageFetches(failures);
    salvageRecovered = salvaged.work.length;
    work = [...work, ...salvaged.work];
    failures = salvaged.failures;

    observabilityLog.info("audit.run.salvage_pass", {
      planned: urls.length,
      politeOk: polite.work.length,
      recovered: salvageRecovered,
      stillFailed: failures.length,
    });
  }

  return { work, failures, salvageRecovered };
}
