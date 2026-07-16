export type BadgeTone = "neutral" | "cyan" | "fuchsia" | "emerald" | "violet" | "amber" | "danger" | "indigo" | "sky";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-white/20 bg-white/5 text-white/60",
  cyan: "border-cyan-300/40 bg-cyan-500/15 text-cyan-200",
  fuchsia: "border-fuchsia-300/40 bg-fuchsia-500/15 text-fuchsia-200",
  emerald: "border-emerald-300/40 bg-emerald-500/15 text-emerald-200",
  violet: "border-violet-300/40 bg-violet-500/15 text-violet-200",
  amber: "border-amber-300/40 bg-amber-500/15 text-amber-200",
  danger: "border-red-300/40 bg-red-500/15 text-red-200",
  indigo: "border-indigo-300/40 bg-indigo-500/15 text-indigo-200",
  sky: "border-sky-300/40 bg-sky-500/15 text-sky-200",
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-[9px]",
  md: "px-2.5 py-1 text-[10px]",
} as const;

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  size?: "sm" | "md";
};

// Generalizes the small pill/chip pattern repeated across VyraCoach
// (trustTier, resourceType), the battle page (streak, difficulty), and
// mastery-map (mastered/improving/weak counts) -- `rounded-full border
// px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider` with a
// different color per instance, never named as one component before.
export function Badge({ tone = "neutral", size = "sm", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-wider ${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]} ${className || ""}`}
      {...rest}
    >
      {children}
    </span>
  );
}
