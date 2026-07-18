"use client";

import { useCountUp } from "@/lib/useCountUp";

// Standalone version of the count-up tween StatCard already has built in --
// use this anywhere a number needs to animate toward a new value (score,
// accuracy, mastery percent) without pulling in StatCard's label/hint/icon
// layout. `format` lets a caller add a suffix/prefix (%, pts, x) without
// the tween itself needing to know about it.
export function AnimatedNumber({
  value,
  durationSeconds = 0.6,
  format = (n) => String(n),
  className,
}: {
  value: number;
  durationSeconds?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const displayed = useCountUp(value, durationSeconds);
  return <span className={className}>{format(displayed)}</span>;
}
