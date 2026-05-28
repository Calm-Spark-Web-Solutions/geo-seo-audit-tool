"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateProfile } from "@/app/(dashboard)/settings/actions";
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
import { ColorModeSegmented } from "@/components/theme/ColorModeSegmented";

type Props = {
  email: string;
  initialFullName: string;
};

export function ProfileSettingsSection({
  email,
  initialFullName,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData(e.currentTarget);
      const r = await updateProfile(fd);
      if (!r.ok) {
        toast.error("Could not save profile", { description: r.error });
        return;
      }
      toast.success("Profile saved");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Card id="profile">
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>
          Your display name appears in the app shell. If you use a social or
          SSO sign-in, your photo may still come from that provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              value={email}
              disabled
              readOnly
              className="bg-muted/50"
            />
            <p className="text-xs text-muted-foreground">
              Email is managed by your sign-in provider.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Display name</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={initialFullName}
              autoComplete="name"
              placeholder="Your name"
            />
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Color mode</p>
              <p className="text-xs text-muted-foreground">
                Light or dark appearance for the dashboard.
              </p>
            </div>
            <ColorModeSegmented />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
