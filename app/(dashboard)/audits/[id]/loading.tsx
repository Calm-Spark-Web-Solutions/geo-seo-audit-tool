import { Skeleton } from "@/components/ui/skeleton";

export default function AuditDetailLoading() {
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="flex flex-col gap-3 pt-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </>
  );
}
