import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Community } from "@/types";

interface Props {
  community: Community;
}

export function CommunityCard({ community }: Props) {
  return (
    <Link href={`/communities/${community.id}`} className="block">
      <Card className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900">
        <CardHeader>
          <CardTitle className="truncate">{community.name}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-neutral-500 dark:text-neutral-400">
          <span className="truncate">{community.website_url}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
