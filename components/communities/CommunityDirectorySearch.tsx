import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  companyId: string;
  /** Current trimmed search for controlled default */
  query: string;
}

export function CommunityDirectorySearch({ companyId, query }: Props) {
  const action = `/companies/${companyId}`;

  return (
    <form method="get" action={action} className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor={`community-q-${companyId}`}>
        Search communities
      </label>
      <Input
        id={`community-q-${companyId}`}
        name="q"
        type="search"
        placeholder="Search by name or URL…"
        defaultValue={query}
        className="sm:max-w-sm"
        autoComplete="off"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Search</Button>
        {query ? (
          <Button variant="outline" asChild type="button">
            <Link href={action}>Clear</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
