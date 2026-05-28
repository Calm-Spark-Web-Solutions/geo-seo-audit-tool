"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Trash2, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { CompanyMemberWithEmail, CompanyRole } from "@/types";

export type PendingCompanyInviteRow = {
  id: string;
  email: string;
  role: CompanyRole;
  expires_at: string;
  created_at: string;
};

interface CompanyTeamShellProps {
  companyId: string;
  currentUserId: string;
  isPrivileged: boolean;
  members: CompanyMemberWithEmail[];
  pendingInvites: PendingCompanyInviteRow[];
  membersError: string | null;
  /** When set, shown in the header (e.g. organization name on Settings). */
  organizationLabel?: string;
}

function roleLabel(role: CompanyRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

/** Member / invite lists come from server props; mutations call `router.refresh()`. */
export function CompanyTeamShell({
  companyId,
  currentUserId,
  isPrivileged,
  members,
  pendingInvites,
  membersError,
  organizationLabel,
}: CompanyTeamShellProps) {
  const router = useRouter();
  const supabase = createClient();
  const inviteFieldId = useId();
  const inviteEmailId = `${inviteFieldId}-email`;
  const inviteRoleId = `${inviteFieldId}-role`;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  async function onInviteSubmit(e: FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Enter an email address.");
      return;
    }
    setInviteSubmitting(true);
    setLastAcceptUrl(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole }),
      });
      const data = (await res.json()) as {
        acceptUrl?: string;
        invite?: PendingCompanyInviteRow;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not create invite");
      if (data.acceptUrl) setLastAcceptUrl(data.acceptUrl);
      toast.success("Invite created — share the link with your teammate.");
      setInviteEmail("");
      router.refresh();
    } catch (err) {
      toast.error("Invite failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function copyAcceptUrl() {
    if (!lastAcceptUrl) return;
    try {
      await navigator.clipboard.writeText(lastAcceptUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  }

  async function revokeInvite(inviteId: string) {
    setRevokingId(inviteId);
    try {
      const { error } = await supabase
        .from("company_invites")
        .delete()
        .eq("id", inviteId)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      toast.success("Invite revoked");
      router.refresh();
    } catch (err) {
      toast.error("Could not revoke invite", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRevokingId(null);
    }
  }

  async function removeMember(targetUserId: string) {
    if (targetUserId === currentUserId) {
      toast.error("You cannot remove yourself from the team here.");
      return;
    }
    if (
      !window.confirm(
        "Remove this person from the organization? They will lose access immediately.",
      )
    ) {
      return;
    }
    setRemovingUserId(targetUserId);
    try {
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("company_id", companyId)
        .eq("user_id", targetUserId);
      if (error) throw new Error(error.message);
      toast.success("Member removed");
      router.refresh();
    } catch (err) {
      toast.error("Could not remove member", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-3 sm:p-4 md:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {organizationLabel ? (
            <>
              Team <span className="text-muted-foreground">· {organizationLabel}</span>
            </>
          ) : (
            "Team"
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          People who can access this organization. Owners and admins can invite
          teammates by email; share the invite link so they can sign in and
          accept.
        </p>
      </div>

      {membersError ? (
        <p className="text-sm text-destructive" role="alert">
          We couldn&rsquo;t load this team right now. Refresh the page, and
          contact support if it keeps happening.
        </p>
      ) : null}

      {isPrivileged ? (
        <form onSubmit={onInviteSubmit} className="space-y-4 border-b border-border pb-6">
          <h3 className="text-sm font-medium">Invite someone</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label htmlFor={inviteEmailId}>Email</Label>
              <Input
                id={inviteEmailId}
                type="email"
                autoComplete="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviteSubmitting}
              />
            </div>
            <div className="w-full space-y-2 sm:w-40">
              <Label htmlFor={inviteRoleId}>Role</Label>
              <select
                id={inviteRoleId}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "member" | "admin")
                }
                disabled={inviteSubmitting}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button
              type="submit"
              disabled={inviteSubmitting}
              className="w-full shrink-0 sm:w-auto"
            >
              {inviteSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                "Create invite"
              )}
            </Button>
          </div>
          {lastAcceptUrl ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="mb-2 font-medium text-foreground">Invite link</p>
              <p className="mb-2 break-all font-mono text-xs text-muted-foreground">
                {lastAcceptUrl}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={copyAcceptUrl}>
                <Copy className="mr-2 h-4 w-4" aria-hidden />
                Copy link
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}

      {isPrivileged && pendingInvites.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Pending invites</h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {pendingInvites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{inv.email}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {roleLabel(inv.role)} · expires{" "}
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => revokeInvite(inv.id)}
                  disabled={revokingId === inv.id}
                >
                  {revokingId === inv.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden />
                  )}
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Members</h3>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members found.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const canRemove =
                isPrivileged && !isSelf && m.role !== "owner";
              return (
                <li
                  key={m.user_id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">{m.email}</span>
                    {isSelf ? (
                      <span className="text-muted-foreground"> (you)</span>
                    ) : null}
                    <span className="text-muted-foreground">
                      {" "}
                      · {roleLabel(m.role)}
                    </span>
                  </div>
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => removeMember(m.user_id)}
                      disabled={removingUserId === m.user_id}
                    >
                      {removingUserId === m.user_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <UserMinus className="h-4 w-4" aria-hidden />
                      )}
                      Remove
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
