import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  Tag,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  AuditCheckEvidence,
  AuditCheckEvidenceItem,
  CheckResult,
} from "@/types";

const INLINE_PREVIEW = 6;

function inspectorHref(
  inspector: AuditCheckEvidence["inspector"],
  auditId: string,
  pageId: string,
): string | null {
  if (!inspector) return null;
  return `/visibility-scans/${auditId}/pages/${pageId}/inspectors/${inspector}`;
}

function ResultDot({ result }: { result: CheckResult }) {
  if (result === "pass")
    return (
      <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden />
    );
  if (result === "warn")
    return (
      <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden />
    );
  return <CircleX className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />;
}

function LinkItem({ item }: { item: Extract<AuditCheckEvidenceItem, { type: "link" }> }) {
  let host = "";
  let path = item.url;
  try {
    const u = new URL(item.url);
    host = u.host;
    path = u.pathname + (u.search || "");
  } catch {
    /* keep raw */
  }
  return (
    <li className="flex min-w-0 items-start gap-2 text-xs">
      <LinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-foreground hover:underline"
          title={item.url}
        >
          <span className="text-muted-foreground">{host}</span>
          <span>{path}</span>
        </a>
        {item.anchor ? (
          <p className="truncate text-muted-foreground">“{item.anchor}”</p>
        ) : null}
      </div>
    </li>
  );
}

function ImageItem({ item }: { item: Extract<AuditCheckEvidenceItem, { type: "image" }> }) {
  return (
    <li className="flex min-w-0 items-start gap-2 text-xs">
      <ImageIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <a
          href={item.src}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-mono text-foreground hover:underline"
          title={item.src}
        >
          {item.src}
        </a>
        {item.nearText ? (
          <p className="truncate text-muted-foreground">{item.nearText}</p>
        ) : null}
      </div>
    </li>
  );
}

function HeadingItem({
  item,
}: {
  item: Extract<AuditCheckEvidenceItem, { type: "heading" }>;
}) {
  return (
    <li className="flex min-w-0 items-start gap-2 text-xs">
      <span
        className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded border border-border bg-muted/40 px-1 py-0 font-mono text-[10px] text-muted-foreground"
        aria-label={`Heading level ${item.level}`}
      >
        H{item.level}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{item.text}</span>
    </li>
  );
}

function SchemaItem({
  item,
}: {
  item: Extract<AuditCheckEvidenceItem, { type: "schema" }>;
}) {
  return (
    <li>
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs">
        <Tag className="h-3 w-3 text-muted-foreground" aria-hidden />
        <span className="font-mono">{item.schemaType}</span>
      </span>
    </li>
  );
}

function KvItem({ item }: { item: Extract<AuditCheckEvidenceItem, { type: "kv" }> }) {
  return (
    <li className="flex min-w-0 items-start gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{item.label}:</span>
      <span className="min-w-0 flex-1 break-words font-medium text-foreground">
        {item.value}
      </span>
    </li>
  );
}

function PsiAuditItem({
  item,
}: {
  item: Extract<AuditCheckEvidenceItem, { type: "psi_audit" }>;
}) {
  const pct =
    item.score !== null && Number.isFinite(item.score)
      ? `${Math.round(item.score * 100)}/100`
      : "n/a";
  return (
    <li className="flex min-w-0 items-start gap-2 text-xs">
      <ResultDot result={item.result} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{item.title}</p>
        <p className="text-muted-foreground">
          <span className="tabular-nums">{pct}</span>
          {item.displayValue ? <> · {item.displayValue}</> : null}
        </p>
      </div>
    </li>
  );
}

function partitionItems(items: AuditCheckEvidenceItem[]) {
  const links: Extract<AuditCheckEvidenceItem, { type: "link" }>[] = [];
  const images: Extract<AuditCheckEvidenceItem, { type: "image" }>[] = [];
  const headings: Extract<AuditCheckEvidenceItem, { type: "heading" }>[] = [];
  const schemas: Extract<AuditCheckEvidenceItem, { type: "schema" }>[] = [];
  const psi: Extract<AuditCheckEvidenceItem, { type: "psi_audit" }>[] = [];
  const kvs: Extract<AuditCheckEvidenceItem, { type: "kv" }>[] = [];
  for (const it of items) {
    if (it.type === "link") links.push(it);
    else if (it.type === "image") images.push(it);
    else if (it.type === "heading") headings.push(it);
    else if (it.type === "schema") schemas.push(it);
    else if (it.type === "psi_audit") psi.push(it);
    else kvs.push(it);
  }
  return { links, images, headings, schemas, psi, kvs };
}

export function CheckEvidence({
  evidence,
  auditId,
  pageId,
  className,
}: {
  evidence: AuditCheckEvidence;
  auditId?: string;
  pageId?: string;
  className?: string;
}) {
  const { items, totalCount, inspector } = evidence;
  if (!items.length) return null;
  const groups = partitionItems(items);
  const inspectorTarget =
    inspector && auditId && pageId
      ? inspectorHref(inspector, auditId, pageId)
      : null;
  const totalShown = items.length;
  const remaining =
    typeof totalCount === "number" && totalCount > totalShown
      ? totalCount - totalShown
      : 0;

  return (
    <div className={cn("mt-2 flex flex-col gap-3", className)}>
      {groups.kvs.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {groups.kvs.map((k, i) => (
            <KvItem key={`kv-${i}`} item={k} />
          ))}
        </ul>
      ) : null}

      {groups.schemas.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {groups.schemas.map((s, i) => (
            <SchemaItem key={`schema-${s.schemaType}-${i}`} item={s} />
          ))}
        </ul>
      ) : null}

      {groups.headings.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {groups.headings.slice(0, INLINE_PREVIEW).map((h, i) => (
            <HeadingItem key={`h-${i}`} item={h} />
          ))}
        </ul>
      ) : null}

      {groups.links.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {groups.links.slice(0, INLINE_PREVIEW).map((l, i) => (
            <LinkItem key={`l-${i}`} item={l} />
          ))}
        </ul>
      ) : null}

      {groups.images.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {groups.images.slice(0, INLINE_PREVIEW).map((g, i) => (
            <ImageItem key={`img-${i}`} item={g} />
          ))}
        </ul>
      ) : null}

      {groups.psi.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {groups.psi.slice(0, INLINE_PREVIEW).map((p, i) => (
            <PsiAuditItem key={`psi-${i}`} item={p} />
          ))}
        </ul>
      ) : null}

      {inspectorTarget ? (
        <div className="pt-1">
          <Link
            href={inspectorTarget}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            View full list{remaining > 0 ? ` (+${remaining} more)` : ""}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : remaining > 0 ? (
        <p className="text-xs text-muted-foreground">
          +{remaining} more not shown
        </p>
      ) : null}
    </div>
  );
}
