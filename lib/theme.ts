// Shared design-token class strings for AcedIQ.
// Primary: competitive scarlet. Accent: amber win energy. Legacy "indigo"
// tone names resolve to primary for backward compatibility.

export const GRADIENTS = {
  brandPrimary: "bg-gradient-to-r from-brand-primary to-brand-primary-emphasis",
  brandHeading: "bg-gradient-to-r from-brand-primary via-brand-primary-emphasis to-brand-primary",
  battle: "bg-gradient-to-r from-brand-primary to-brand-accent",
  accent: "bg-gradient-to-r from-brand-primary-emphasis to-brand-accent",
} as const;

export const BRAND = {
  primary: "bg-brand-primary text-white hover:bg-brand-primary-emphasis shadow-glow-primary-sm hover:shadow-glow-primary-md",
  /** @deprecated use primary */
  indigo: "bg-brand-primary text-white hover:bg-brand-primary-emphasis shadow-glow-primary-sm hover:shadow-glow-primary-md",
  indigoOutline: "border border-white/15 text-white hover:border-white/25 hover:bg-white/[0.04]",
  accent: "bg-brand-accent text-[#1a1a2e] hover:bg-brand-accent-emphasis",
  accentOutline: "border border-brand-accent/40 text-brand-accent hover:border-brand-accent/60 hover:bg-brand-accent/10",
} as const;

export const MARKETING = {
  page: "bg-marketing-bg text-marketing-text",
  surface: "bg-marketing-surface border border-marketing-border",
  textSecondary: "text-marketing-text-secondary",
  primaryBtn:
    "bg-brand-primary text-white hover:bg-brand-primary-emphasis shadow-marketing-sm hover:shadow-marketing-md",
  secondaryBtn:
    "border border-marketing-border bg-marketing-surface text-marketing-text hover:bg-marketing-bg",
} as const;

export const SURFACE = {
  neutralSubtle: "border border-white/10 bg-white/[0.03]",
  neutralEmphasis: "border border-white/15 bg-white/[0.06]",
  primarySubtle: "border border-brand-primary/20 bg-brand-primary/10",
  primaryEmphasis: "border border-brand-primary/35 bg-brand-primary/20",
  /** @deprecated use primarySubtle */
  indigoSubtle: "border border-brand-primary/20 bg-brand-primary/10",
  /** @deprecated use primaryEmphasis */
  indigoEmphasis: "border border-brand-primary/35 bg-brand-primary/20",
  accentSubtle: "border border-brand-accent/25 bg-brand-accent/10",
  accentEmphasis: "border border-brand-accent/40 bg-brand-accent/15",
  amberSubtle: "border border-amber-400/20 bg-amber-500/10",
  amberEmphasis: "border border-amber-400/35 bg-amber-500/20",
  dangerSubtle: "border border-red-400/25 bg-red-500/10",
  dangerEmphasis: "border border-red-400/40 bg-red-500/15",
  cyanSubtle: "border border-brand-primary/20 bg-brand-primary/10",
  cyanEmphasis: "border border-brand-primary/35 bg-brand-primary/20",
  fuchsiaSubtle: "border border-brand-primary/20 bg-brand-primary/10",
  fuchsiaEmphasis: "border border-brand-primary/35 bg-brand-primary/20",
  violetSubtle: "border border-brand-primary/20 bg-brand-primary/10",
  violetEmphasis: "border border-brand-primary/35 bg-brand-primary/20",
  skySubtle: "border border-brand-primary/20 bg-brand-primary/10",
  skyEmphasis: "border border-brand-primary/35 bg-brand-primary/20",
  emeraldSubtle: "border border-green-400/20 bg-green-500/10",
  emeraldEmphasis: "border border-green-400/35 bg-green-500/20",
} as const;

export const TRANSITIONS = {
  colorFast: "transition-colors duration-fast",
  pressable: "transition-transform duration-base ease-premium-out hover:scale-[1.02] active:scale-[0.98]",
  entranceSlow: "transition-all duration-slow ease-premium-out",
} as const;

export const RADIUS = {
  control: "rounded-lg",
  card: "rounded-xl",
  panel: "rounded-2xl",
  hero: "rounded-3xl",
  pill: "rounded-full",
} as const;
