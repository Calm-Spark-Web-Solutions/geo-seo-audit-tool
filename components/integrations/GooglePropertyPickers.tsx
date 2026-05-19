"use client";

import { useMemo } from "react";

import type { Ga4AccountOption } from "@/lib/integrations/google/match-property";
import { googlePropertySelectClass } from "@/lib/integrations/google/google-properties-ui";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface GooglePropertyValues {
  gscSiteUrl: string;
  ga4AccountId: string;
  ga4PropertyId: string;
}

interface Props {
  idPrefix: string;
  gscSites: Array<{ siteUrl: string }>;
  ga4Accounts: Ga4AccountOption[];
  values: GooglePropertyValues;
  onChange: (values: GooglePropertyValues) => void;
  /** stacked = edit page sections; compact = table cells */
  layout?: "stacked" | "compact";
  disabled?: boolean;
}

export function GooglePropertyPickers({
  idPrefix,
  gscSites,
  ga4Accounts,
  values,
  onChange,
  layout = "stacked",
  disabled = false,
}: Props) {
  const propertiesForAccount = useMemo(() => {
    if (!values.ga4AccountId) return [];
    return (
      ga4Accounts.find((a) => a.accountId === values.ga4AccountId)?.properties ??
      []
    );
  }, [ga4Accounts, values.ga4AccountId]);

  const selectedProperty = useMemo(
    () =>
      propertiesForAccount.find((p) => p.propertyId === values.ga4PropertyId),
    [propertiesForAccount, values.ga4PropertyId],
  );

  function onAccountChange(accountId: string) {
    const account = ga4Accounts.find((a) => a.accountId === accountId);
    const stillValid = account?.properties.some(
      (p) => p.propertyId === values.ga4PropertyId,
    );
    onChange({
      ...values,
      ga4AccountId: accountId,
      ga4PropertyId: stillValid
        ? values.ga4PropertyId
        : (account?.properties[0]?.propertyId ?? ""),
    });
  }

  if (layout === "compact") {
    return (
      <div className="flex min-w-[16rem] flex-col gap-3">
        <div className="space-y-1">
          <Label
            htmlFor={`${idPrefix}-gsc`}
            className="text-xs font-medium text-foreground"
          >
            Google Search Console
          </Label>
          <select
            id={`${idPrefix}-gsc`}
            value={values.gscSiteUrl}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...values, gscSiteUrl: e.target.value })
            }
            className={cn(googlePropertySelectClass, "h-8 text-xs")}
          >
            <option value="">Not mapped</option>
            {gscSites.map((s) => (
              <option key={s.siteUrl} value={s.siteUrl}>
                {s.siteUrl}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground">Google Analytics</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label
                htmlFor={`${idPrefix}-ga4-account`}
                className="text-xs font-normal text-muted-foreground"
              >
                Account
              </Label>
              <select
                id={`${idPrefix}-ga4-account`}
                value={values.ga4AccountId}
                disabled={disabled}
                onChange={(e) => onAccountChange(e.target.value)}
                className={cn(googlePropertySelectClass, "h-8 text-xs")}
              >
                <option value="">Not mapped</option>
                {ga4Accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor={`${idPrefix}-ga4-property`}
                className="text-xs font-normal text-muted-foreground"
              >
                Property
              </Label>
              <select
                id={`${idPrefix}-ga4-property`}
                value={values.ga4PropertyId}
                disabled={disabled || !values.ga4AccountId}
                onChange={(e) =>
                  onChange({ ...values, ga4PropertyId: e.target.value })
                }
                className={cn(googlePropertySelectClass, "h-8 text-xs")}
              >
                <option value="">Not mapped</option>
                {propertiesForAccount.map((p) => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold">Google Search Console</h3>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-gsc`}>Site</Label>
          <select
            id={`${idPrefix}-gsc`}
            value={values.gscSiteUrl}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...values, gscSiteUrl: e.target.value })
            }
            className={googlePropertySelectClass}
          >
            <option value="">Not mapped</option>
            {gscSites.map((s) => (
              <option key={s.siteUrl} value={s.siteUrl}>
                {s.siteUrl}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold">Google Analytics</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-ga4-account`}>Account</Label>
            <select
              id={`${idPrefix}-ga4-account`}
              value={values.ga4AccountId}
              disabled={disabled}
              onChange={(e) => onAccountChange(e.target.value)}
              className={googlePropertySelectClass}
            >
              <option value="">Select account…</option>
              {ga4Accounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-ga4-property`}>Property</Label>
            <select
              id={`${idPrefix}-ga4-property`}
              value={values.ga4PropertyId}
              disabled={disabled || !values.ga4AccountId}
              onChange={(e) =>
                onChange({ ...values, ga4PropertyId: e.target.value })
              }
              className={googlePropertySelectClass}
            >
              <option value="">Not mapped</option>
              {propertiesForAccount.map((p) => (
                <option key={p.propertyId} value={p.propertyId}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {selectedProperty?.dataStreamName || selectedProperty?.defaultUri ? (
          <p className="text-xs text-muted-foreground">
            {selectedProperty.dataStreamName
              ? `Data stream: ${selectedProperty.dataStreamName}`
              : null}
            {selectedProperty.defaultUri
              ? `${selectedProperty.dataStreamName ? " · " : ""}Default URI: ${selectedProperty.defaultUri}`
              : null}
          </p>
        ) : null}
      </section>
    </div>
  );
}
