"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CompanyRole } from "@/types";

export type BulkInviteCompanyOption = { id: string; name: string };

type BatchResultRow = {
  company_id: string;
  company_name: string;
  acceptUrl: string;
};

export function BulkInvitePanel({
  companies,
}: {
  companies: BulkInviteCompanyOption[];
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(companies.map((c) => [c.id, true])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [lastResults, setLastResults] = useState<BatchResultRow[] | null>(null);

  const selectedIds = companies.filter((c) => selected[c.id]).map((c) => c.id);

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function selectAll() {
    setSelected(Object.fromEntries(companies.map((c) => [c.id, true])));
  }

  function clearAll() {
    setSelected(Object.fromEntries(companies.map((c) => [c.id, false])));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Enter an email address.");
      return;
    }
    if (selectedIds.length === 0) {
      toast.error("Select at least one organization.");
      return;
    }

    setSubmitting(true);
    setLastResults(null);
    try {
      const res = await fetch("/api/companies/invites/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          role: role as CompanyRole,
          company_ids: selectedIds,
        }),
      });
      const data = (await res.json()) as {
        results?: Array<{
          company_id: string;
          company_name: string;
          acceptUrl: string;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not create invites");

      const rows =
        data.results?.map((r) => ({
          company_id: r.company_id,
          company_name: r.company_name,
          acceptUrl: r.acceptUrl,
        })) ?? [];

      setLastResults(rows);
      toast.success(
        rows.length === 1
          ? "Invite created — share the link."
          : `${rows.length} invites created — share each link with your teammate.`,
      );
      setEmail("");
      router.refresh();
    } catch (err) {
      toast.error("Bulk invite failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  }

  if (companies.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4 md:p-6">
      <div className="space-y-1 pb-4">
        <h3 className="text-lg font-semibold tracking-tight">
          Invite across organizations
        </h3>
        <p className="text-sm text-muted-foreground">
          Each organization gets its own invite link with the same email and role.
          Your teammate must accept once per organization — share every link they
          need.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[200px] flex-1 space-y-2">
            <Label htmlFor="bulk-invite-email">Email</Label>
            <Input
              id="bulk-invite-email"
              type="email"
              autoComplete="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="w-full space-y-2 sm:w-40">
            <Label htmlFor="bulk-invite-role">Role</Label>
            <select
              id="bulk-invite-role"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "member" | "admin")
              }
              disabled={submitting}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="w-full shrink-0 sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create invites"
            )}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-medium">Organizations</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={selectAll}
                disabled={submitting}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={clearAll}
                disabled={submitting}
              >
                Clear
              </Button>
            </div>
          </div>
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
            {companies.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <input
                  id={`bulk-org-${c.id}`}
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-input"
                  checked={Boolean(selected[c.id])}
                  onChange={() => toggle(c.id)}
                  disabled={submitting}
                />
                <label
                  htmlFor={`bulk-org-${c.id}`}
                  className="cursor-pointer leading-snug"
                >
                  {c.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </form>

      {lastResults && lastResults.length > 0 ? (
        <div className="mt-6 space-y-3 border-t border-border pt-6">
          <p className="text-sm font-medium text-foreground">Invite links</p>
          <ul className="space-y-3">
            {lastResults.map((r) => (
              <li
                key={r.company_id}
                className="rounded-md border border-border bg-muted/30 p-3 text-sm"
              >
                <p className="mb-2 font-medium text-foreground">
                  {r.company_name}
                </p>
                <p className="mb-2 break-all font-mono text-xs text-muted-foreground">
                  {r.acceptUrl}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyUrl(r.acceptUrl)}
                >
                  <Copy className="mr-2 h-4 w-4" aria-hidden />
                  Copy link
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
