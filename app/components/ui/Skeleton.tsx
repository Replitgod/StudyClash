// Replaces ad hoc `animate-pulse rounded-lg bg-white/5` loading placeholders
// (e.g. Navigation's auth-state placeholder) with a consistent shimmer.
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <div
      className={`animate-[skeleton-shimmer_1.6s_ease-in-out_infinite] rounded-lg bg-[linear-gradient(110deg,rgba(255,255,255,0.04)_8%,rgba(255,255,255,0.09)_18%,rgba(255,255,255,0.04)_33%)] bg-[length:200%_100%] ${className}`}
      aria-hidden="true"
    />
  );
}

// A stack of skeleton lines, for card/list loading states.
export function SkeletonLines({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={index === count - 1 ? "h-4 w-2/3" : "h-4 w-full"} />
      ))}
    </div>
  );
}
