"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SocialPreviewMeta } from "@/lib/social-preview/extract";

export type SocialPlatform = "facebook" | "linkedin" | "x" | "google" | "slack";

const PLATFORMS: Array<{ id: SocialPlatform; label: string }> = [
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "google", label: "Google" },
  { id: "slack", label: "Slack" },
];

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function Chip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        ok
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300"
          : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      {label}: {ok ? "Found" : "Missing"}
    </span>
  );
}

function PlaceholderImage({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
      role="img"
      aria-label="No preview image in metadata"
    >
      <span className="text-xs font-medium">No image</span>
    </div>
  );
}

function PreviewImage({
  src,
  alt,
  className,
  aspectClass,
}: {
  src: string | null;
  alt: string;
  className?: string;
  aspectClass: string;
}) {
  return (
    <div className={cn("w-full overflow-hidden bg-muted", aspectClass, className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary audited-site URLs; avoid remotePatterns churn
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <PlaceholderImage className="h-full min-h-[120px] w-full" />
      )}
    </div>
  );
}

function FacebookCard({ meta }: { meta: SocialPreviewMeta }) {
  const title = truncate(meta.title || "No title", 80);
  const desc = truncate(meta.description, 220);
  const host =
    meta.siteName ||
    (() => {
      try {
        return new URL(meta.displayUrl).hostname.replace(/^www\./, "");
      } catch {
        return meta.displayUrl;
      }
    })();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <PreviewImage
        src={meta.imageUrl}
        alt=""
        aspectClass="aspect-[1.91/1] max-h-[220px]"
      />
      <div className="space-y-1 bg-muted/30 px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {truncate(host, 48)}
        </p>
        <p className="text-[17px] font-semibold leading-snug text-foreground">{title}</p>
        <p className="line-clamp-3 text-[15px] leading-snug text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function LinkedInCard({ meta }: { meta: SocialPreviewMeta }) {
  const title = truncate(meta.title || "No title", 72);
  const desc = truncate(meta.description, 200);
  let domain = meta.displayUrl;
  try {
    domain = new URL(meta.displayUrl).hostname.replace(/^www\./, "");
  } catch {
    /* keep string */
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background shadow-sm">
      <PreviewImage
        src={meta.imageUrl}
        alt=""
        aspectClass="aspect-[1.91/1] max-h-[200px]"
      />
      <div className="border-t border-border px-3 py-2">
        <p className="text-[13px] font-semibold leading-snug text-foreground">{title}</p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
          {desc}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">{domain}</p>
      </div>
    </div>
  );
}

function XCard({ meta }: { meta: SocialPreviewMeta }) {
  const large =
    meta.twitterCard === "summary_large_image" || meta.twitterCard === null;
  const title = truncate(meta.title || "No title", large ? 70 : 64);
  const desc = truncate(meta.description, large ? 160 : 120);
  let host = "";
  try {
    host = new URL(meta.displayUrl).hostname.replace(/^www\./, "");
  } catch {
    host = meta.displayUrl;
  }

  if (large) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        <PreviewImage
          src={meta.imageUrl}
          alt=""
          aspectClass="aspect-[2/1] max-h-[200px]"
        />
        <div className="px-3 pb-3 pt-2">
          <p className="text-[13px] text-muted-foreground">{host}</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">
            {title}
          </p>
          <p className="mt-1 line-clamp-2 text-[15px] text-muted-foreground">{desc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex gap-3 p-3">
        <div className="w-[84px] shrink-0">
          <PreviewImage
            src={meta.imageUrl}
            alt=""
            aspectClass="aspect-square rounded-lg"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">{host}</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-foreground">
            {title}
          </p>
          <p className="mt-1 line-clamp-2 text-[14px] text-muted-foreground">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function GoogleCard({ meta }: { meta: SocialPreviewMeta }) {
  const title = truncate(meta.title || "No title", 66);
  const desc = truncate(meta.description, 280);
  let display = meta.displayUrl;
  try {
    const u = new URL(meta.displayUrl);
    display = u.hostname.replace(/^www\./, "") + u.pathname;
    if (display.length > 72) display = `${display.slice(0, 69)}…`;
  } catch {
    display = truncate(display, 72);
  }

  return (
    <div className="max-w-xl rounded-md border border-transparent px-1 py-2">
      <p className="text-[18px] leading-snug text-[#1a0dab] dark:text-blue-400">
        {title}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-emerald-800 dark:text-emerald-400/90">
        {display}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{desc}</p>
    </div>
  );
}

function SlackCard({ meta }: { meta: SocialPreviewMeta }) {
  const title = truncate(meta.title || "No title", 76);
  const desc = truncate(meta.description, 240);
  let host = "";
  try {
    host = new URL(meta.displayUrl).hostname.replace(/^www\./, "");
  } catch {
    host = meta.displayUrl;
  }

  return (
    <div className="flex overflow-hidden rounded border border-border bg-muted/40">
      <div className="w-1 shrink-0 bg-emerald-600/80" aria-hidden />
      <div className="flex min-w-0 flex-1 gap-3 p-2">
        <div className="w-[72px] shrink-0 self-start overflow-hidden rounded bg-background">
          <PreviewImage
            src={meta.imageUrl}
            alt=""
            aspectClass="aspect-square"
          />
        </div>
        <div className="min-w-0 py-0.5">
          <p className="text-[15px] font-semibold leading-snug text-foreground">{title}</p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-muted-foreground">
            {desc}
          </p>
          <p className="mt-2 text-[11px] font-medium text-muted-foreground">{host}</p>
        </div>
      </div>
    </div>
  );
}

export interface SocialPreviewPanelProps {
  auditedUrl: string;
  meta: SocialPreviewMeta | null;
  fetchFailed: boolean;
}

export function SocialPreviewPanel({
  auditedUrl,
  meta,
  fetchFailed,
}: SocialPreviewPanelProps) {
  const [platform, setPlatform] = useState<SocialPlatform>("facebook");

  const preview = useMemo(() => {
    if (!meta) return null;
    switch (platform) {
      case "facebook":
        return <FacebookCard meta={meta} />;
      case "linkedin":
        return <LinkedInCard meta={meta} />;
      case "x":
        return <XCard meta={meta} />;
      case "google":
        return <GoogleCard meta={meta} />;
      case "slack":
        return <SlackCard meta={meta} />;
      default:
        return null;
    }
  }, [meta, platform]);

  if (fetchFailed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load page</CardTitle>
          <CardDescription>
            The preview fetch failed (timeout, blocked, or unreachable). Open the live
            URL to verify tags, or retry after the site is available.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="break-all font-mono text-xs">{auditedUrl}</p>
        </CardContent>
      </Card>
    );
  }

  if (!meta) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No preview data</CardTitle>
          <CardDescription>
            Something went wrong while parsing metadata for this URL.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Approximate link previews from tags we could read today—not guaranteed to match
        Facebook, Google, or X caches or bot-specific behavior.
      </p>

      <div className="flex flex-wrap gap-2">
        <Chip label="Title" ok={meta.chips.titleFound} />
        <Chip label="Description" ok={meta.chips.descriptionFound} />
        <Chip label="Image" ok={meta.chips.imageFound} />
        <Chip label="OG tags" ok={meta.chips.ogCoreComplete} />
        {meta.twitterCard ? (
          <Badge variant="outline" className="font-normal">
            twitter:card: {meta.twitterCard}
          </Badge>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Platform</p>
        <div
          className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
          role="tablist"
          aria-label="Social platform preview"
        >
          {PLATFORMS.map(({ id, label }) => {
            const active = platform === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                )}
                onClick={() => setPlatform(id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Social Preview</p>
        <div className="rounded-xl border border-border bg-muted/20 p-4 md:p-6">{preview}</div>
      </div>
    </div>
  );
}
