import Link from "next/link";

import type { Community } from "@/types";

export type CommunityLatestAuditScores = {
  score: number | null;
  seo_score: number | null;
  geo_score: number | null;
};

interface Props {
  communities: Community[];
  latestAuditScores?: Record<string, CommunityLatestAuditScores>;
}

function ScoreCell({ value }: { value: number | null }) {
  return <span className="tabular-nums">{value ?? "—"}</span>;
}

export function CommunityTable({ communities, latestAuditScores = {} }: Props) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Community
            </th>
            <th className="hidden px-4 py-2 text-left font-medium text-muted-foreground sm:table-cell">
              Website
            </th>
            <th className="hidden px-4 py-2 text-right font-medium text-muted-foreground sm:table-cell">
              Total
            </th>
            <th className="hidden px-4 py-2 text-right font-medium text-muted-foreground md:table-cell">
              SEO
            </th>
            <th className="hidden px-4 py-2 text-right font-medium text-muted-foreground md:table-cell">
              GEO
            </th>
          </tr>
        </thead>
        <tbody>
          {communities.map((c) => {
            const scores = latestAuditScores[c.id];
            return (
              <tr
                key={c.id}
                className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/60"
              >
                <td className="p-0 align-middle">
                  <Link
                    href={`/communities/${c.id}`}
                    className="block px-4 py-2.5 font-medium transition-colors"
                  >
                    <span className="line-clamp-2">{c.name}</span>
                    <span className="mt-1 block truncate text-xs font-normal text-muted-foreground sm:hidden">
                      {c.website_url}
                    </span>
                    <span className="mt-1 block text-xs tabular-nums text-muted-foreground sm:hidden">
                      Total <ScoreCell value={scores?.score ?? null} />
                    </span>
                  </Link>
                </td>
                <td className="hidden max-w-[18rem] p-0 align-middle sm:table-cell">
                  <Link
                    href={`/communities/${c.id}`}
                    className="block truncate px-4 py-2.5 text-muted-foreground transition-colors"
                  >
                    {c.website_url}
                  </Link>
                </td>
                <td className="hidden p-0 align-middle sm:table-cell">
                  <Link
                    href={`/communities/${c.id}`}
                    className="block whitespace-nowrap px-4 py-2.5 text-right tabular-nums transition-colors"
                  >
                    <ScoreCell value={scores?.score ?? null} />
                  </Link>
                </td>
                <td className="hidden p-0 align-middle md:table-cell">
                  <Link
                    href={`/communities/${c.id}`}
                    className="block whitespace-nowrap px-4 py-2.5 text-right tabular-nums transition-colors"
                  >
                    <ScoreCell value={scores?.seo_score ?? null} />
                  </Link>
                </td>
                <td className="hidden p-0 align-middle md:table-cell">
                  <Link
                    href={`/communities/${c.id}`}
                    className="block whitespace-nowrap px-4 py-2.5 text-right tabular-nums transition-colors"
                  >
                    <ScoreCell value={scores?.geo_score ?? null} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
