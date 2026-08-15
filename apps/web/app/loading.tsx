import { Skeleton } from "../components/ui/primitives";

/** Route-level fallback. Mirrors the catalogue's shape so the swap doesn't jump. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-3 h-4 w-72" />
      <Skeleton className="mt-6 h-9 w-full max-w-md" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-64" />
        ))}
      </div>
    </div>
  );
}
