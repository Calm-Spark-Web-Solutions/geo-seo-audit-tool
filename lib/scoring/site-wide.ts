import { normalizeUrl } from "@/lib/crawler/normalize";
import { boundedText } from "@/lib/security/bounded-fetch";
import { assertSafeUrl } from "@/lib/security/ssrf";
import type { AuditCheck, CheckResult } from "@/types";

import { scoreFromResult } from "./deterministic";

const FETCH_TIMEOUT_MS = 8000;
// Body cap for outbound site-wide probes. robots.txt and sitemap.xml on
// well-behaved sites are KB-scale; 2 MiB is generous for ugly cases (e.g.
// monolithic sitemap dumps) while preventing a hostile origin from
// streaming gigabytes into memory.
const FETCH_MAX_BYTES = 2 * 1024 * 1024;
const COMMON_SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml"];

const AI_USER_AGENTS = ["GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "PerplexityBot"];

function auditCheck(
  key: string,
  label: string,
  result: CheckResult,
  explanation: string,
  category = "Site-wide crawlability",
): AuditCheck {
  return {
    key,
    label,
    result,
    explanation,
    score: scoreFromResult(result),
    category,
    pillar: "SEO",
  };
}

async function fetchText(origin: string, path: string): Promise<{ ok: boolean; status: number; text: string }> {
  const base = normalizeUrl(origin);
  if (!base) return { ok: false, status: 0, text: "" };
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // SSRF preflight before any socket opens. Treat rejection like any
    // other fetch failure (empty result) so a private-DNS audit URL fails
    // gracefully without aborting the run.
    await assertSafeUrl(url);
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { Accept: "text/plain,text/html,*/*" },
    });
    // boundedText streams and aborts the body at FETCH_MAX_BYTES so a
    // hostile origin can't OOM us with an unbounded response. Final 200k
    // slice preserves the parsing budget downstream callers expect.
    const { text } = await boundedText(res, FETCH_MAX_BYTES);
    return { ok: res.ok, status: res.status, text: text.slice(0, 200_000) };
  } catch {
    return { ok: false, status: 0, text: "" };
  } finally {
    clearTimeout(t);
  }
}

function stripComments(line: string): string {
  const hash = line.indexOf("#");
  return (hash >= 0 ? line.slice(0, hash) : line).trim();
}

function parseRobotsBlocks(robots: string): { agents: string[]; rules: string[] }[] {
  const blocks: { agents: string[]; rules: string[] }[] = [];
  let agents: string[] = [];
  let rules: string[] = [];

  const flush = () => {
    if (agents.length > 0) {
      blocks.push({ agents: [...agents], rules: [...rules] });
      agents = [];
      rules = [];
    }
  };

  for (const line of robots.split(/\r?\n/)) {
    const t = stripComments(line);
    if (!t) {
      flush();
      continue;
    }
    const ua = /^User-Agent:\s*(.+)$/i.exec(t);
    if (ua) {
      if (rules.length > 0) flush();
      agents.push(ua[1].trim());
      continue;
    }
    if (agents.length > 0) rules.push(t);
  }
  flush();
  return blocks;
}

function blockAppliesToAgent(blockAgents: string[], agent: string): boolean {
  const al = agent.toLowerCase();
  return blockAgents.some((a) => a === "*" || a.toLowerCase() === al);
}

function hasRootDisallow(rules: string[]): boolean {
  return rules.some((r) => {
    const m = /^Disallow:\s*(.*)$/i.exec(r.trim());
    if (!m) return false;
    const path = m[1].trim();
    return path === "/";
  });
}

function agentRootDisallowed(robots: string, agent: string): boolean {
  for (const b of parseRobotsBlocks(robots)) {
    if (blockAppliesToAgent(b.agents, agent) && hasRootDisallow(b.rules)) return true;
  }
  return false;
}

function anyAiFullyBlocked(body: string): { blockedAgents: string[] } {
  const blocked: string[] = [];
  for (const a of AI_USER_AGENTS) {
    if (agentRootDisallowed(body, a)) blocked.push(a);
  }
  return { blockedAgents: blocked };
}

function extractSitemapUrls(robots: string): string[] {
  const out: string[] = [];
  const re = /^Sitemap:\s*(.+)$/gim;
  let m;
  while ((m = re.exec(robots)) !== null) {
    const url = m[1].trim();
    if (url.startsWith("http")) out.push(url);
  }
  return out.slice(0, 10);
}

async function probeSitemapOk(urlStr: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // SSRF preflight; rejection just means the sitemap "fails" the probe
    // which downgrades the check, never aborts the audit.
    await assertSafeUrl(urlStr);
    const head = await fetch(urlStr, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (head.ok) {
      // HEAD bodies are empty per spec, but a misbehaving server can
      // still send one — release the socket eagerly.
      await head.body?.cancel().catch(() => undefined);
      return true;
    }
    await head.body?.cancel().catch(() => undefined);
    const get = await fetch(urlStr, { method: "GET", redirect: "follow", signal: ctrl.signal });
    const ok = get.ok;
    // Drain through boundedText so a hostile origin returning a
    // multi-GB stream doesn't blow up memory while we're just checking
    // reachability.
    await boundedText(get, FETCH_MAX_BYTES).catch(() => undefined);
    return ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One-per-audit origin probes: robots.txt + sitemap discovery.
 */
export async function runSiteWideChecks(originWebsiteUrl: string): Promise<AuditCheck[]> {
  const origin = normalizeUrl(originWebsiteUrl);
  if (!origin) {
    return [
      auditCheck("sitewide_origin", "Origin URL", "fail", "Could not derive site origin for site-wide checks."),
    ];
  }

  const checks: AuditCheck[] = [];

  const robotsResp = await fetchText(origin, "/robots.txt");
  const robotsMissing = robotsResp.status === 404;
  const robotsFail = !robotsResp.ok && !robotsMissing;

  if (robotsMissing) {
    checks.push(
      auditCheck(
        "sitewide_robots_txt",
        "robots.txt reachable",
        "warn",
        "/robots.txt returned 404; consider publishing a policy (and Sitemap lines) so crawlers know your intent.",
      ),
    );
  } else if (robotsFail) {
    checks.push(
      auditCheck(
        "sitewide_robots_txt",
        "robots.txt reachable",
        "warn",
        `Could not fetch /robots.txt (HTTP ${robotsResp.status || "network error"}).`,
      ),
    );
  } else {
    checks.push(
      auditCheck(
        "sitewide_robots_txt",
        "robots.txt reachable",
        "pass",
        `/robots.txt fetched successfully (${robotsResp.text.length.toLocaleString()} bytes).`,
      ),
    );
  }

  const body = robotsResp.ok ? robotsResp.text : "";
  const { blockedAgents } = body.length > 0 ? anyAiFullyBlocked(body) : { blockedAgents: [] as string[] };
  const aiBlocked = blockedAgents.length > 0;
  checks.push(
    auditCheck(
      "sitewide_ai_bot_access",
      "AI crawler access (GPTBot / ClaudeBot / PerplexityBot)",
      aiBlocked ? "warn" : body.length > 0 ? "pass" : "warn",
      aiBlocked
        ? `User-agent sections appear to fully disallow: ${blockedAgents.join(", ")}. Confirm GEO / AI crawler strategy.`
        : body.length > 0
          ? "No unconditional root Disallow detected for monitored AI bots in parsed robots.txt."
          : "robots.txt missing or empty — could not evaluate AI bot rules.",
    ),
  );

  const IMPORTANT_PATHS = ["/services", "/about", "/contact", "/blog", "/products", "/pricing"];
  const disallowedServicePaths: string[] = [];
  if (body.length > 0) {
    for (const block of parseRobotsBlocks(body)) {
      if (!blockAppliesToAgent(block.agents, "*")) continue;
      for (const rule of block.rules) {
        const m = /^Disallow:\s*(.+)$/i.exec(rule.trim());
        if (!m) continue;
        const path = m[1].trim();
        if (IMPORTANT_PATHS.some((ip) => path.startsWith(ip))) {
          disallowedServicePaths.push(path);
        }
      }
    }
  }
  checks.push(
    auditCheck(
      "sitewide_service_path_disallow",
      "Service path disallow rules",
      disallowedServicePaths.length === 0 ? "pass" : "warn",
      disallowedServicePaths.length === 0
        ? "No Disallow rules targeting important content paths (/services, /about, /contact, etc.) detected."
        : `Wildcard Disallow rules cover important content paths: ${disallowedServicePaths.slice(0, 5).join(", ")}. Verify these pages should be blocked from crawlers.`,
    ),
  );

  const declared = body.length > 0 ? extractSitemapUrls(body) : [];
  const candidates =
    declared.length > 0
      ? [...declared]
      : COMMON_SITEMAP_PATHS.map((p) => `${origin}${p}`);

  let okUrl: string | null = null;
  for (const c of candidates) {
    let abs = c;
    if (!/^https?:\/\//i.test(c)) abs = normalizeUrl(c, `${origin}/`) ?? c;
    if (await probeSitemapOk(abs)) {
      okUrl = abs;
      break;
    }
  }

  const smResult: CheckResult = okUrl ? "pass" : declared.length > 0 ? "warn" : "warn";
  const smExpl = okUrl
    ? declared.length > 0
      ? `Sitemap discovered (${okUrl}); HTTP reachable. Verify submission in Search Console separately.`
      : `Discovered reachable sitemap at ${okUrl} (common location). Declare Sitemap lines in robots where possible.`
    : declared.length > 0
      ? `Sitemap URLs declared (${declared.slice(0, 3).join(", ")}${declared.length > 3 ? "…" : ""}) but could not retrieve one over HTTP — check hosting or redirects.`
      : "Could not locate a reachable sitemap at common paths (/sitemap.xml) or via robots Sitemap directives.";

  checks.push(auditCheck("sitewide_sitemap", "XML sitemap discoverable", smResult, smExpl));

  return checks;
}
