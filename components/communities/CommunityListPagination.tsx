import Link from "next/link";

import { Button } from "@/components/ui/button";

const PAGE_PARAM = "page";
const Q_PARAM = "q";

function buildHref(companyId: string, pageNum: number, query: string) {
  const p = new URLSearchParams();
  if (query) p.set(Q_PARAM, query);
  if (pageNum > 1) p.set(PAGE_PARAM, String(pageNum));
  const qs = p.toString();
  return qs ? `/companies/${companyId}?${qs}` : `/companies/${companyId}`;
}

interface Props {
  companyId: string;
  page: number;
  totalPages: number;
  query: string;
}

export function CommunityListPagination({ companyId, page, totalPages, query }: Props) {
  if (totalPages <= 1) return null;

  const prevHref = buildHref(companyId, page - 1, query);
  const nextHref = buildHref(companyId, page + 1, query);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page <= 1 ? (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={prevHref}>Previous</Link>
          </Button>
        )}
        {page >= totalPages ? (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={nextHref}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
