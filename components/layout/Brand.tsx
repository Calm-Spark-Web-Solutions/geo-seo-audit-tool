import Link from "next/link";
import { Activity } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { icon: "h-4 w-4", text: "text-sm" },
  md: { icon: "h-5 w-5", text: "text-base" },
  lg: { icon: "h-6 w-6", text: "text-xl" },
};

export function Brand({ href = "/", size = "md", className }: Props) {
  const { icon, text } = sizeMap[size];
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight",
        text,
        className,
      )}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity className={icon} aria-hidden />
      </span>
      <span>InyoCare Audit</span>
    </span>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
