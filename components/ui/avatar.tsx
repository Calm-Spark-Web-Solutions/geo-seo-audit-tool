import * as React from "react";

import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string | null;
  alt?: string;
  fallback: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

// Pixel dimensions for the inner <img>. Mirrors `sizeClasses` (Tailwind:
// h-7=28, h-9=36, h-12=48) and is set as `width`/`height` attributes so
// the browser reserves the slot before the avatar URL resolves — avoids
// CLS in the topbar / member rows on slow connections.
const sizePx: Record<NonNullable<AvatarProps["size"]>, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

export function Avatar({
  src,
  alt,
  fallback,
  size = "md",
  className,
  ...props
}: AvatarProps) {
  const initials = fallback.slice(0, 2).toUpperCase();
  const dim = sizePx[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden rounded-full border border-border bg-muted font-medium text-muted-foreground",
        sizeClasses[size],
        className,
      )}
      aria-label={alt ?? fallback}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? fallback}
          width={dim}
          height={dim}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}

export function initialsFor(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
