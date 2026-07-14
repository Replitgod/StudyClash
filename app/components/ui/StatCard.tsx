"use client";

import { motion } from "framer-motion";
import { useCountUp } from "@/lib/useCountUp";
import { springSmooth } from "@/lib/motion";

type StatCardProps = {
  label: string;
  value: number | string;
  suffix?: string;
  isLoading?: boolean;
  hint?: string;
  valueClassName?: string;
  className?: string;
};

// Generalizes the `rounded-2xl border ... p-5` stat-tile pattern repeated
// across dashboard/results/etc, with a count-up animation for numeric
// values (see lib/useCountUp.ts) instead of a value that just snaps in.
// Numeric or string values both work -- string values (e.g. "Unlimited",
// a plan name) render as-is without animating.
export function StatCard({ label, value, suffix = "", isLoading, hint, valueClassName, className }: StatCardProps) {
  const numericValue = typeof value === "number" ? value : 0;
  const displayed = useCountUp(numericValue);
  const content = isLoading ? "—" : typeof value === "number" ? `${displayed}${suffix}` : value;

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={springSmooth}
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm ${className || ""}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">{label}</p>
      <p className={`mt-3 text-3xl font-black text-white tabular-nums ${valueClassName || ""}`}>{content}</p>
      {hint && <p className="mt-2 text-sm text-white/45">{hint}</p>}
    </motion.div>
  );
}
