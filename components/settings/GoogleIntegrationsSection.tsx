"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export interface GoogleOrgRow {
  companyId: string;
  companyName: string;
  canManage: boolean;
  connected: boolean;
  googleAccountEmail: string | null;
  communityCount: number;
  mappedCommunityCount: number;
}

interface Props {
  organizations: GoogleOrgRow[];
  oauthConfigured: boolean;
  flash?: "connected" | "error";
  flashReason?: string;
}

export function GoogleIntegrationsSection({
  organizations,
  oauthConfigured: configured,
  flash,
  flashReason,
}: Props) {
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function disconnect(companyId: string) {
    setDisconnecting(companyId);
    try {
      await fetch("/api/integrations/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      window.location.reload();
    } finally {
      setDisconnecting(null);
    }
  }

  if (!configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Search Console &amp; GA4</CardTitle>
          <CardDescription>
            OAuth is not configured on this server. Set{" "}
            <code className="text-xs">GOOGLE_OAUTH_*</code> environment variables.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const adminOrgs = organizations.filter((o) => o.canManage);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Search Console &amp; GA4</CardTitle>
        <CardDescription>
          Connect a Google account once per organization. Map Search Console sites
          and GA4 properties on each organization&apos;s page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flash === "connected" ? (
          <p className="text-sm text-green-700 dark:text-green-400" role="status">
            Google account connected successfully.
          </p>
        ) : null}
        {flash === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            Google connection failed
            {flashReason ? `: ${decodeURIComponent(flashReason)}` : "."}
          </p>
        ) : null}

        {adminOrgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You need owner or admin access on an organization to connect Google.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {adminOrgs.map((org) => (
              <li
                key={org.companyId}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{org.companyName}</p>
                  {org.connected ? (
                    <p className="text-sm text-muted-foreground">
                      Connected
                      {org.googleAccountEmail
                        ? ` as ${org.googleAccountEmail}`
                        : ""}
                      {org.communityCount > 0 ? (
                        <>
                          {" · "}
                          <span className="tabular-nums">
                            {org.mappedCommunityCount}/{org.communityCount}
                          </span>{" "}
                          {org.communityCount === 1 ? "community" : "communities"}{" "}
                          mapped
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not connected</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {org.connected ? (
                    <>
                      <Button type="button" variant="secondary" size="sm" asChild>
                        <a
                          href={`/companies/${encodeURIComponent(org.companyId)}#google-integrations`}
                        >
                          Manage properties
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disconnecting === org.companyId}
                        onClick={() => void disconnect(org.companyId)}
                      >
                        {disconnecting === org.companyId
                          ? "Disconnecting…"
                          : "Disconnect"}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" asChild>
                      {/* Full navigation — OAuth must not use Next.js client Link (RSC + CSP). */}
                      <a
                        href={`/api/integrations/google/connect?company_id=${encodeURIComponent(org.companyId)}&return_to=${encodeURIComponent(`/companies/${org.companyId}`)}`}
                      >
                        Connect Google
                      </a>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
