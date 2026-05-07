import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityDetailLoading() {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-64 w-full" />
    </>
  );
}
