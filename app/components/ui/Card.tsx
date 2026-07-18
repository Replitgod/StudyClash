import { SURFACE } from "@/lib/theme";

// "accent" is the canonical name going forward (see lib/theme.ts) --
// cyan/fuchsia/violet/sky are legacy aliases of indigo, kept working for
// existing call sites but not to be used in new code.
export type CardTone = "neutral" | "indigo" | "accent" | "amber" | "danger" | "cyan" | "fuchsia" | "emerald" | "violet" | "sky";

const TONE_CLASSES: Record<CardTone, string> = {
  neutral: SURFACE.neutralSubtle,
  indigo: SURFACE.indigoSubtle,
  accent: SURFACE.accentSubtle,
  amber: SURFACE.amberSubtle,
  danger: SURFACE.dangerSubtle,
  // --- legacy aliases ---
  cyan: SURFACE.cyanSubtle,
  fuchsia: SURFACE.fuchsiaSubtle,
  violet: SURFACE.violetSubtle,
  sky: SURFACE.skySubtle,
  emerald: SURFACE.emeraldSubtle,
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
