import { SURFACE } from "@/lib/theme";

export type CardTone = "neutral" | "cyan" | "fuchsia" | "emerald" | "violet" | "amber" | "danger";

const TONE_CLASSES: Record<CardTone, string> = {
  neutral: SURFACE.neutralSubtle,
  cyan: SURFACE.cyanSubtle,
  fuchsia: SURFACE.fuchsiaSubtle,
  emerald: SURFACE.emeraldSubtle,
  violet: SURFACE.violetSubtle,
  amber: SURFACE.amberSubtle,
  danger: SURFACE.dangerSubtle,
};

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: CardTone;
  padding?: "sm" | "md" | "lg";
};

const PADDING_CLASSES = {
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

// Generalizes the `rounded-2xl border border-white/10 bg-white/[0.03]
// backdrop-blur-sm` glass-panel pattern repeated across nearly every page.
export function Card({ tone = "neutral", padding = "md", className, children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl backdrop-blur-sm ${TONE_CLASSES[tone]} ${PADDING_CLASSES[padding]} ${className || ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
