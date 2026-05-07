import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Company } from "@/types";

interface Props {
  company: Company;
  communityCount?: number;
}

export function CompanyCard({ company, communityCount }: Props) {
  return (
    <Link href={`/companies/${company.id}`} className="block">
      <Card className="h-full transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900">
        <CardHeader>
          <CardTitle className="truncate">{company.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm text-neutral-500 dark:text-neutral-400">
          {company.contact_name ? (
            <span className="truncate">{company.contact_name}</span>
          ) : null}
          {company.contact_email ? (
            <span className="truncate">{company.contact_email}</span>
          ) : null}
          <span>
            {communityCount ?? 0}{" "}
            {communityCount === 1 ? "community" : "communities"}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
