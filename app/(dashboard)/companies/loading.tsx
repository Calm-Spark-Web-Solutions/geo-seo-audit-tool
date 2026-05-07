import { Skeleton } from "@/components/ui/skeleton";

export default function CompaniesLoading() {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    </>
  );
}
