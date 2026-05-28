import Link from "next/link";
import { LineChart } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { googleMappingStatus } from "@/lib/integrations/google/google-properties-ui";

interface CommunityRow {
  id: string;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
}

export function CompanyGoogleSetupBanner({
  companyId,
  googleConnected,
  communities,
}: {
  companyId: string;
  googleConnected: boolean;
  communities: CommunityRow[];
}) {
  const total = communities.length;
  const mapped = communities.filter(
    (c) =>
      googleMappingStatus(c.gsc_site_url, c.ga4_property_id) === "mapped",
  ).length;
  const setupComplete =
    googleConnected && (total === 0 || mapped === total);

  if (setupComplete) return null;

  const googleHref = `/integrations/google?org=${encodeURIComponent(companyId)}`;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChart className="h-4 w-4 shrink-0" aria-hidden />
          Google Analytics & Search Console
        </CardTitle>
        <CardDescription>
          {!googleConnected
            ? "Connect Google to show Search Console and Analytics traffic on community pages and scan reports."
            : total === 0
              ? "Add a community, then map Google properties for each website."
              : `Connected — ${mapped} of ${total} communit${total === 1 ? "y" : "ies"} mapped. Finish mapping so scans can use live traffic data.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={googleHref}>
            {!googleConnected ? "Connect Google" : "Finish Google setup"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
