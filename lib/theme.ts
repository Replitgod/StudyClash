// Shared design-token class strings, following the same pattern as
// lib/uiLayout.ts (which owns z-index/fixed-position constants). This file
// owns everything color/motion related that isn't a single Tailwind utility:
// gradient combos, "glass panel" surface tiers, and transition presets.
//
// This is additive, not a repaint: it names the handful of gradient/surface
// combinations already used repeatedly (and slightly differently) across the
// app, so new and refactored components reuse one definition instead of
// hand-tuning opacity values again. The underlying cyan/fuchsia/emerald/
// violet battle-game palette is unchanged.

// The two dominant CTA gradients, plus the two secondary/decorative ones.
//
// brandPrimary/brandHeading carry the site's indigo/blue brand identity
// (see BRAND below); the cyan/fuchsia/emerald/violet battle-game palette
// stays for in-battle state colors (streaks, correctness, etc.) below.
export const GRADIENTS = {
  /** Primary action gradient — signup, submit, main CTAs. */
  brandPrimary: "bg-gradient-to-r from-indigo-600 to-indigo-500",
  /** Wordmark/heading gradient — logo text, feature headings. */
  brandHeading: "bg-gradient-to-r from-indigo-400 via-indigo-500 to-sky-400",
  /** High-urgency "Battle AI" entry points. */
  battle: "bg-gradient-to-r from-cyan-300 to-emerald-300",
  /** Secondary/decorative accent. */
  accent: "bg-gradient-to-r from-cyan-500 to-fuchsia-500",
} as const;

// Solid brand colors — the new indigo/blue system. Prefer these over
// GRADIENTS.brandPrimary for buttons and controls: gradients and glow
// shadows read as "AI slop"; a flat fill with a one-step hover shift reads
// as a considered product.
export const BRAND = {
  indigo: "bg-indigo-600 text-white hover:bg-indigo-500",
  indigoOutline: "border border-white/15 text-white hover:border-white/25 hover:bg-white/[0.04]",
} as const;

// "Glass panel" surface tiers: a background + border opacity pairing that
// was already the de facto standard across the app, just never named.
// `Subtle` = default resting state, `Emphasis` = active/hover/selected state.
//
// These are plain string literals, not built from a template-literal helper,
// because Tailwind's compiler statically scans source files for complete
// class names — a dynamically-interpolated `border-${color}-400/20` would
// silently produce no CSS at build time. Keep every entry a literal string.
export const SURFACE = {
  cyanSubtle: "border border-cyan-400/20 bg-cyan-500/10",
  cyanEmphasis: "border border-cyan-400/35 bg-cyan-500/20",
  fuchsiaSubtle: "border border-fuchsia-400/20 bg-fuchsia-500/10",
  fuchsiaEmphasis: "border border-fuchsia-400/35 bg-fuchsia-500/20",
  emeraldSubtle: "border border-emerald-400/20 bg-emerald-500/10",
  emeraldEmphasis: "border border-emerald-400/35 bg-emerald-500/20",
  violetSubtle: "border border-violet-400/20 bg-violet-500/10",
  violetEmphasis: "border border-violet-400/35 bg-violet-500/20",
  amberSubtle: "border border-amber-400/20 bg-amber-500/10",
  amberEmphasis: "border border-amber-400/35 bg-amber-500/20",
  dangerSubtle: "border border-red-400/25 bg-red-500/10",
  dangerEmphasis: "border border-red-400/40 bg-red-500/15",
  neutralSubtle: "border border-white/10 bg-white/[0.03]",
  neutralEmphasis: "border border-white/15 bg-white/[0.06]",
  indigoSubtle: "border border-indigo-400/20 bg-indigo-500/10",
  indigoEmphasis: "border border-indigo-400/35 bg-indigo-500/20",
  skySubtle: "border border-sky-400/20 bg-sky-500/10",
  skyEmphasis: "border border-sky-400/35 bg-sky-500/20",
} as const;

// Transition presets — named per the standardized duration/easing tokens
// added to app/globals.css's @theme block.
export const TRANSITIONS = {
  /** Color/border hover states — buttons, links, nav items. */
  colorFast: "transition-colors duration-fast",
  /** The "settle into place" hover/tap bounce used on every CTA. */
  pressable: "transition-transform duration-base ease-brand-bounce hover:scale-[1.03] active:scale-95",
  /** Panel/modal slide or fade entrances. */
  entranceSlow: "transition-all duration-slow ease-brand-bounce",
} as const;

export const RADIUS = {
  control: "rounded-lg",
  card: "rounded-xl",
  panel: "rounded-2xl",
  hero: "rounded-3xl",
  pill: "rounded-full",
} as const;
