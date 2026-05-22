"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  saveCommunityGoogleProperties,
  type GooglePropertiesSaveState,
} from "@/app/(dashboard)/communities/google-properties-actions";
import { suggestGoogleProperties } from "@/lib/integrations/google/match-property";
import type { Ga4AccountOption } from "@/lib/integrations/google/match-property";
import {
  accountIdForGa4Property,
  fetchGooglePropertiesCatalog,
  friendlyGa4ApiError,
} from "@/lib/integrations/google/google-properties-ui";
import { GooglePropertyPickers } from "@/components/integrations/GooglePropertyPickers";
import { Button } from "@/components/ui/button";

interface Props {
  communityId: string;
  companyId: string;
  websiteUrl: string;
  initialGscSiteUrl: string | null;
  initialGa4PropertyId: string | null;
  googleConnected: boolean;
  /** Link to organization Google hub */
  companyHubHref?: string;
}

const initialState: GooglePropertiesSaveState = { ok: true };

export function CommunityGooglePropertiesForm({
  communityId,
  companyId,
  websiteUrl,
  initialGscSiteUrl,
  initialGa4PropertyId,
  googleConnected,
  companyHubHref,
}: Props) {
  const [state, formAction, pending] = useActionState(
    saveCommunityGoogleProperties,
    initialState,
  );
  const [gscSites, setGscSites] = useState<Array<{ siteUrl: string }>>([]);
  const [ga4Accounts, setGa4Accounts] = useState<Ga4AccountOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gscLoadError, setGscLoadError] = useState<string | null>(null);
  const [ga4LoadError, setGa4LoadError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [values, setValues] = useState({
    gscSiteUrl: initialGscSiteUrl ?? "",
    ga4AccountId: "",
    ga4PropertyId: initialGa4PropertyId ?? "",
  });

  useEffect(() => {
    if (!googleConnected) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchGooglePropertiesCatalog(companyId);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      const { catalog } = result;
      setGscLoadError(catalog.gscError);
      setGa4LoadError(catalog.ga4Error);
      setLoadError(null);
      setGscSites(catalog.gscSites);
      setGa4Accounts(catalog.ga4Accounts);

      const flatProps = catalog.ga4Accounts.flatMap((a) => a.properties);
      const suggestion = suggestGoogleProperties(
        websiteUrl,
        catalog.gscSites,
        flatProps,
      );

      setValues((prev) => {
        const gscSiteUrl =
          prev.gscSiteUrl || initialGscSiteUrl || suggestion.gscSiteUrl || "";
        const ga4PropertyId =
          prev.ga4PropertyId ||
          initialGa4PropertyId ||
          suggestion.ga4PropertyId ||
          "";
        const ga4AccountId =
          prev.ga4AccountId ||
          accountIdForGa4Property(catalog.ga4Accounts, ga4PropertyId) ||
          (catalog.ga4Accounts.length === 1
            ? catalog.ga4Accounts[0].accountId
            : "");
        return { gscSiteUrl, ga4AccountId, ga4PropertyId };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    googleConnected,
    websiteUrl,
    initialGscSiteUrl,
    initialGa4PropertyId,
  ]);

  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) wasPending.current = true;
    if (wasPending.current && !pending && state.ok && !state.error) {
      setSavedFlash(true);
      wasPending.current = false;
      const t = setTimeout(() => setSavedFlash(false), 3000);
      return () => clearTimeout(t);
    }
  }, [state, pending]);

  if (!googleConnected) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect Google for this organization on the{" "}
        <Link
          href={`/integrations/google?org=${encodeURIComponent(companyId)}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Google setup
        </Link>{" "}
        page to map Search Console and Analytics properties.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="community_id" value={communityId} />
      <input type="hidden" name="gsc_site_url" value={values.gscSiteUrl} />
      <input type="hidden" name="ga4_property_id" value={values.ga4PropertyId} />

      {companyHubHref ? (
        <p className="text-sm text-muted-foreground">
          <a
            href={companyHubHref}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Manage all communities for this organization
          </a>{" "}
          in one place, or configure this community only below.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose which Search Console site and GA4 property match{" "}
          <span className="font-medium text-foreground">{websiteUrl}</span>.
        </p>
      )}

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}
      {ga4LoadError ? (
        <p className="text-sm text-destructive" role="alert">
          <span className="font-medium">GA4:</span> {friendlyGa4ApiError(ga4LoadError)}
        </p>
      ) : null}
      {gscLoadError ? (
        <p className="text-sm text-destructive" role="alert">
          <span className="font-medium">Search Console:</span> {gscLoadError}
        </p>
      ) : null}
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {savedFlash ? (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          Property mapping saved.
        </p>
      ) : null}

      <GooglePropertyPickers
        idPrefix={`community-${communityId}`}
        gscSites={gscSites}
        ga4Accounts={ga4Accounts}
        values={values}
        onChange={setValues}
        layout="stacked"
        disabled={pending}
      />

      <Button type="submit" disabled={pending} size="sm" className="w-fit">
        {pending ? "Saving…" : "Save Google properties"}
      </Button>
    </form>
  );
}
