import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 space-y-6">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </main>
  );
}
