"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { saveCompanyGooglePropertiesBatch } from "@/app/(dashboard)/communities/google-properties-actions";
import { GoogleMappingStatusBadge } from "@/components/integrations/GoogleMappingStatusBadge";
import { GooglePropertyPickers } from "@/components/integrations/GooglePropertyPickers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { suggestGoogleProperties } from "@/lib/integrations/google/match-property";
import {
  accountIdForGa4Property,
  fetchGooglePropertiesCatalog,
  friendlyGa4ApiError,
  googleMappingStatus,
  type GooglePropertiesCatalog,
} from "@/lib/integrations/google/google-properties-ui";
import { friendlyTokenRefreshError } from "@/lib/integrations/google/oauth-error-copy";

export interface CompanyCommunityGoogleRow {
  id: string;
  name: string;
  website_url: string;
  gsc_site_url: string | null;
  ga4_property_id: string | null;
}

interface Props {
  companyId: string;
  companyName: string;
  googleConnected: boolean;
  googleAccountEmail: string | null;
  googleLastError?: string | null;
  communities: CompanyCommunityGoogleRow[];
  oauthConfigured: boolean;
  showConnectedFlash?: boolean;
}

type RowValues = {
  gscSiteUrl: string;
  ga4AccountId: string;
  ga4PropertyId: string;
};

function initialRowValues(
  community: CompanyCommunityGoogleRow,
  catalog: GooglePropertiesCatalog | null,
): RowValues {
  const savedGsc = community.gsc_site_url ?? "";
  const savedGa4 = community.ga4_property_id ?? "";
  if (savedGsc || savedGa4) {
    return {
      gscSiteUrl: savedGsc,
      ga4PropertyId: savedGa4,
      ga4AccountId: catalog
        ? accountIdForGa4Property(catalog.ga4Accounts, savedGa4)
        : "",
    };
  }
  if (!catalog) {
    return { gscSiteUrl: "", ga4AccountId: "", ga4PropertyId: "" };
  }
  const flat = catalog.ga4Accounts.flatMap((a) => a.properties);
  const suggestion = suggestGoogleProperties(
    community.website_url,
    catalog.gscSites,
    flat,
  );
  return {
    gscSiteUrl: suggestion.gscSiteUrl ?? "",
    ga4PropertyId: suggestion.ga4PropertyId ?? "",
    ga4AccountId: suggestion.ga4PropertyId
      ? accountIdForGa4Property(catalog.ga4Accounts, suggestion.ga4PropertyId)
      : catalog.ga4Accounts.length === 1
        ? catalog.ga4Accounts[0].accountId
        : "",
  };
}

export function CompanyGoogleIntegrationsPanel({
  companyId,
  companyName,
  googleConnected,
  googleAccountEmail,
  googleLastError = null,
  communities,
  oauthConfigured,
  showConnectedFlash = false,
}: Props) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [catalog, setCatalog] = useState<GooglePropertiesCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowValues, setRowValues] = useState<Record<string, RowValues>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const initRows = useCallback(
    (cat: GooglePropertiesCatalog | null) => {
      const next: Record<string, RowValues> = {};
      for (const c of communities) {
        next[c.id] = initialRowValues(c, cat);
      }
      setRowValues(next);
    },
    [communities],
  );

  const canLoadCatalog = googleConnected && oauthConfigured;
  const [prevCanLoadCatalog, setPrevCanLoadCatalog] = useState(canLoadCatalog);
  if (canLoadCatalog !== prevCanLoadCatalog) {
    setPrevCanLoadCatalog(canLoadCatalog);
    if (!canLoadCatalog) {
      setCatalog(null);
      setLoadError(null);
      initRows(null);
    }
  }

  useEffect(() => {
    if (!canLoadCatalog) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchGooglePropertiesCatalog(companyId);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        setCatalog(null);
        initRows(null);
        return;
      }
      setLoadError(null);
      setCatalog(result.catalog);
      initRows(result.catalog);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, canLoadCatalog, initRows]);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/integrations/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      window.location.reload();
    } finally {
      setDisconnecting(false);
    }
  }

  async function saveAll() {
    setSaving(true);
    setSaveMessage(null);
    const rows = communities.map((c) => {
      const v = rowValues[c.id];
      return {
        communityId: c.id,
        gscSiteUrl: v?.gscSiteUrl?.trim() || null,
        ga4PropertyId: v?.ga4PropertyId?.trim() || null,
      };
    });
    const result = await saveCompanyGooglePropertiesBatch(companyId, rows);
    setSaving(false);
    if (result.ok) {
      setSaveMessage({
        ok: true,
        text: "All property mappings saved. The next visibility scan will use these settings.",
      });
    } else {
      setSaveMessage({ ok: false, text: result.error ?? "Save failed." });
    }
  }

  const connectHref = `/api/integrations/google/connect?company_id=${encodeURIComponent(companyId)}&return_to=${encodeURIComponent(`/integrations/google?org=${companyId}`)}`;

  if (!oauthConfigured) {
    return (
      <Card id="google-integrations">
        <CardHeader>
          <CardTitle className="text-base">Google Search Console &amp; GA4</CardTitle>
          <CardDescription>
            Google OAuth is not configured on this server.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="google-integrations">
      <CardHeader>
        <CardTitle className="text-base">Google Search Console &amp; GA4</CardTitle>
        <CardDescription>
          Connect {companyName} to Google once, then map each community website to
          the right Search Console site and GA4 property.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {showConnectedFlash ? (
          <p
            className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
            role="status"
          >
            Google connected — choose properties for each community below, then
            save.
          </p>
        ) : null}

        {googleConnected && googleLastError ? (
          <ReconnectGoogleNotice
            connectHref={connectHref}
            lastError={googleLastError}
          />
        ) : null}

        <section className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Google account</p>
            {googleConnected ? (
              <p className="text-sm text-muted-foreground">
                Connected
                {googleAccountEmail ? ` as ${googleAccountEmail}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not connected</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {googleConnected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disconnecting}
                onClick={() => void disconnect()}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </Button>
            ) : (
              <Button type="button" size="sm" asChild>
                <a href={connectHref}>Connect Google</a>
              </Button>
            )}
          </div>
        </section>

        {!googleConnected ? (
          <p className="text-sm text-muted-foreground">
            Connect Google to load Search Console sites and GA4 properties for
            your communities.
          </p>
        ) : communities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a community first, then return here to map Google properties.
          </p>
        ) : (
          <>
            {loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : null}
            {catalog?.ga4Error ? (
              <p className="text-sm text-destructive" role="alert">
                <span className="font-medium">GA4:</span>{" "}
                {friendlyGa4ApiError(catalog.ga4Error)}
              </p>
            ) : null}
            {catalog?.gscError ? (
              <p className="text-sm text-destructive" role="alert">
                <span className="font-medium">Search Console:</span>{" "}
                {catalog.gscError}
              </p>
            ) : null}
            {saveMessage ? (
              <p
                className={
                  saveMessage.ok
                    ? "text-sm text-green-700 dark:text-green-400"
                    : "text-sm text-destructive"
                }
                role="status"
              >
                {saveMessage.text}
              </p>
            ) : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Property mapping</h3>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !catalog}
                  onClick={() => void saveAll()}
                >
                  {saving ? "Saving…" : "Save all mappings"}
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-border bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Community
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Search Console &amp; Analytics
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {communities.map((c) => {
                      const v = rowValues[c.id] ?? {
                        gscSiteUrl: "",
                        ga4AccountId: "",
                        ga4PropertyId: "",
                      };
                      const status = googleMappingStatus(
                        v.gscSiteUrl,
                        v.ga4PropertyId,
                      );
                      return (
                        <tr
                          key={c.id}
                          className="border-b border-border align-top last:border-b-0"
                        >
                          <td className="px-3 py-3">
                            <Link
                              href={`/communities/${c.id}`}
                              className="font-medium hover:underline"
                            >
                              {c.name}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {c.website_url}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            {catalog ? (
                              <GooglePropertyPickers
                                idPrefix={`company-${c.id}`}
                                gscSites={catalog.gscSites}
                                ga4Accounts={catalog.ga4Accounts}
                                values={v}
                                onChange={(next) =>
                                  setRowValues((prev) => ({
                                    ...prev,
                                    [c.id]: next,
                                  }))
                                }
                                layout="compact"
                                disabled={saving}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Loading…
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <GoogleMappingStatusBadge status={status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReconnectGoogleNotice({
  connectHref,
  lastError,
}: {
  connectHref: string;
  lastError: string;
}) {
  const friendly = friendlyTokenRefreshError(lastError);
  if (!friendly) return null;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div>
        <p className="font-medium">{friendly.title}</p>
        <p className="mt-0.5 text-amber-800/90 dark:text-amber-200/80">
          {friendly.description}
        </p>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <a href={connectHref}>Reconnect Google</a>
      </Button>
    </div>
  );
}
