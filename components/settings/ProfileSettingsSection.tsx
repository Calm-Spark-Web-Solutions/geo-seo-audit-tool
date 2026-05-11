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

type Props = {
  email: string;
  initialFullName: string;
  initialAvatarUrl: string;
};

export function ProfileSettingsSection({
  email,
  initialFullName,
  initialAvatarUrl,
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
          Your name and avatar appear in the app shell. Avatar accepts an image
          URL (for example from your company directory or Gravatar).
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
          <div className="space-y-2">
            <Label htmlFor="avatar_url">Avatar image URL</Label>
            <Input
              id="avatar_url"
              name="avatar_url"
              type="url"
              inputMode="url"
              defaultValue={initialAvatarUrl}
              placeholder="https://…"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
