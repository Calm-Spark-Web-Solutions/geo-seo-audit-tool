"use client";

import { useActionState } from "react";

import {
  saveMonthlyReportSettings,
  sendMonthlyReportTestEmail,
  type MonthlyReportActionState,
} from "@/app/(dashboard)/integrations/google/monthly-report-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { additionalRecipientsToDisplay } from "@/lib/integrations/google/monthly-report-settings";
import type { MonthlyReportSettings } from "@/lib/integrations/google/monthly-report-settings";

const initialActionState: MonthlyReportActionState = { ok: false };

interface Props {
  companyId: string;
  settings: MonthlyReportSettings;
  recipientPreview: string[];
  lastSentLabel: string | null;
}

function ToggleRow({
  id,
  name,
  label,
  description,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-input"
      />
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="cursor-pointer font-medium">
          {label}
        </Label>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MonthlyReportSettingsCard({
  companyId,
  settings,
  recipientPreview,
  lastSentLabel,
}: Props) {
  const [saveState, saveAction, savePending] = useActionState(
    saveMonthlyReportSettings,
    initialActionState,
  );
  const [testState, testAction, testPending] = useActionState(
    sendMonthlyReportTestEmail,
    initialActionState,
  );

  const flash = saveState.message ?? saveState.error ?? testState.message ?? testState.error;
  const flashOk = Boolean(saveState.message || testState.message);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly automatic report</CardTitle>
        <CardDescription>
          On the 1st of each month at about 07:00 UTC, we refresh Google metrics
          (when enabled), queue a free monthly visibility rescan per mapped
          community (does not use manual scan quota), and email this digest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {flash ? (
          <p
            className={
              flashOk
                ? "text-sm text-green-700 dark:text-green-400"
                : "text-sm text-destructive"
            }
            role="status"
          >
            {flash}
          </p>
        ) : null}

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p>
            <span className="font-medium text-foreground">Last sent: </span>
            {lastSentLabel ?? "Not sent yet"}
          </p>
          <p className="mt-2">
            <span className="font-medium text-foreground">Recipients preview: </span>
            {recipientPreview.length > 0
              ? recipientPreview.join(", ")
              : "None — enable recipients or add addresses below."}
          </p>
        </div>

        <form action={saveAction} className="space-y-5">
          <input type="hidden" name="companyId" value={companyId} />

          <ToggleRow
            id="monthly-enabled"
            name="enabled"
            label="Enable monthly report"
            description="When off, the organization is skipped entirely on the monthly cron."
            defaultChecked={settings.enabled}
          />

          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-medium">Email recipients</legend>
            <ToggleRow
              id="monthly-owners"
              name="includeOwnerEmails"
              label="Include organization owners"
              defaultChecked={settings.include_owner_emails}
            />
            <ToggleRow
              id="monthly-admins"
              name="includeAdminEmails"
              label="Include organization admins"
              defaultChecked={settings.include_admin_emails}
            />
            <ToggleRow
              id="monthly-contact"
              name="includeContactEmail"
              label="Include organization contact email"
              defaultChecked={settings.include_contact_email}
            />
            <div className="space-y-1.5">
              <Label htmlFor="monthly-additional">Additional recipients</Label>
              <Input
                id="monthly-additional"
                name="additionalRecipients"
                type="text"
                defaultValue={additionalRecipientsToDisplay(
                  settings.additional_recipients,
                )}
                placeholder="finance@example.com, ops@example.com"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. Up to 10 valid addresses.
              </p>
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t pt-4">
            <legend className="text-sm font-medium">Before each send</legend>
            <ToggleRow
              id="monthly-sync"
              name="syncMetricsBeforeSend"
              label="Refresh Google metrics before send"
              defaultChecked={settings.sync_metrics_before_send}
            />
            <ToggleRow
              id="monthly-scans"
              name="queueMonthlyScans"
              label="Queue free monthly visibility rescan"
              description="One rescan per mapped community; does not count against manual scan quota."
              defaultChecked={settings.queue_monthly_scans}
            />
          </fieldset>

          <Button type="submit" disabled={savePending}>
            {savePending ? "Saving…" : "Save settings"}
          </Button>
        </form>

        <form action={testAction} className="border-t pt-4">
          <input type="hidden" name="companyId" value={companyId} />
          <p className="mb-3 text-sm text-muted-foreground">
            Send a one-time preview to your account email only. Does not mark the
            month as sent or change cron idempotency.
          </p>
          <Button type="submit" variant="outline" disabled={testPending}>
            {testPending ? "Sending…" : "Send test email to me"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
