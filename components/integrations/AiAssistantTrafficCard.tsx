import { Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GaAiReferral } from "@/types";

interface Props {
  referrals: GaAiReferral[] | null | undefined;
  /**
   * When set, the empty state links to "the robots.txt check on the same scan"
   * (used in the audit detail surface). For community-level views, leave
   * unset so the empty state simply offers educational copy.
   */
  robotsCheckHref?: string;
  title?: string;
  description?: string;
}

/**
 * Sums sessions/active users for each `group` (e.g. multiple OpenAI hosts
 * collapse to a single "OpenAI" line) while preserving the raw label list as
 * a secondary line for transparency.
 */
function groupReferrals(referrals: GaAiReferral[]) {
  const byGroup = new Map<
    string,
    {
      key: string;
      label: string;
      sources: string[];
      sessions: number;
      activeUsers: number;
    }
  >();
  for (const r of referrals) {
    const key = r.group ?? r.label;
    const existing = byGroup.get(key);
    if (existing) {
      existing.sessions += r.sessions;
      existing.activeUsers += r.activeUsers;
      if (!existing.sources.includes(r.label)) existing.sources.push(r.label);
    } else {
      byGroup.set(key, {
        key,
        label: key,
        sources: [r.label],
        sessions: r.sessions,
        activeUsers: r.activeUsers,
      });
    }
  }
  return Array.from(byGroup.values()).sort((a, b) => b.sessions - a.sessions);
}

export function AiAssistantTrafficCard({
  referrals,
  robotsCheckHref,
  title,
  description,
}: Props) {
  const rows = referrals ?? [];
  const grouped = groupReferrals(rows);
  const totalSessions = rows.reduce((acc, r) => acc + r.sessions, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-foreground" aria-hidden />
          {title ?? "AI assistant traffic (28 days)"}
        </CardTitle>
        <CardDescription>
          {description ??
            "Visitors who clicked through to your site from AI assistants like ChatGPT, Perplexity, Gemini, and Copilot."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              No clicks from AI assistants in the last 28 days. AI traffic is
              still a small share of overall web visits, so this is normal for
              many sites.
            </p>
            <p>
              To improve your chances of being cited, make sure your community
              website is crawlable for the bots that train these assistants:
              GPTBot, ClaudeBot, and PerplexityBot.
              {robotsCheckHref ? (
                <>
                  {" "}
                  <a
                    href={robotsCheckHref}
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                  >
                    See the robots.txt check on this scan
                  </a>
                  .
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {totalSessions.toLocaleString()} session
              {totalSessions === 1 ? "" : "s"} from AI assistants in the last
              28 days.
            </p>
            <ul className="divide-y divide-border">
              {grouped.map((row) => (
                <li
                  key={row.key}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{row.label}</p>
                    {row.sources.length > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        {row.sources.join(" + ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-sm font-semibold text-foreground">
                      {row.sessions.toLocaleString()} sessions
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.activeUsers.toLocaleString()} visitors
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
