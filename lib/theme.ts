// Shared design-token class strings, following the same pattern as
// lib/uiLayout.ts (which owns z-index/fixed-position constants). This file
// owns everything color/motion related that isn't a single Tailwind utility:
// gradient combos, "glass panel" surface tiers, and transition presets.
//
// This is additive, not a repaint: it names the handful of gradient/surface
// combinations already used repeatedly (and slightly differently) across the
// app, so new and refactored components reuse one definition instead of
// hand-tuning opacity values again.

// The design system (redesign direction: refined dark "battle energy",
// extended app-wide): ONE primary brand hue (indigo — AI-powered mastery)
// and ONE energetic accent hue (green — competitive/win energy). Every
// other color name below (cyan/fuchsia/violet/sky) is a LEGACY ALIAS kept
// only so existing `tone="cyan"`/etc. call sites across the app keep
// compiling without a mass find-and-replace — they resolve to the same
// indigo values as the canonical `indigo` tone. New code should reach for
// `indigo` (primary) or `accent`/`emerald` (energetic accent), never the
// legacy names.
export const GRADIENTS = {
  /** Primary action gradient — signup, submit, main CTAs. */
  brandPrimary: "bg-gradient-to-r from-indigo-600 to-indigo-500",
  /** Wordmark/heading gradient — logo text, feature headings. */
  brandHeading: "bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-400",
  /** High-urgency "Battle AI" entry points, and the canonical primary→accent
   *  duotone — use this (not a re-derived indigo-only gradient) anywhere the
   *  brief calls for "the energetic gradient." */
  battle: "bg-gradient-to-r from-indigo-300 to-green-300",
  /** Alias of `battle` — same primary→accent duotone, named for use outside
   *  battle-specific contexts (e.g. a marketing section's accent underline). */
  accent: "bg-gradient-to-r from-indigo-400 to-green-400",
} as const;

// Solid brand colors — prefer these over gradients for buttons and
// controls: gradients and glow shadows read as "AI slop"; a flat fill with
// a one-step hover shift reads as a considered product. `indigo` = primary,
// `accent` = the energetic accent (green) — same hue the app already uses
// for correct-answer/confetti/win states, formalized as a first-class brand
// color rather than only appearing as ad hoc `bg-green-*` utilities.
export const BRAND = {
  indigo: "bg-indigo-600 text-white hover:bg-indigo-500",
  indigoOutline: "border border-white/15 text-white hover:border-white/25 hover:bg-white/[0.04]",
  accent: "bg-green-600 text-white hover:bg-green-500",
  accentOutline: "border border-green-400/30 text-green-100 hover:border-green-300/45 hover:bg-green-500/10",
} as const;

// "Glass panel" surface tiers: a background + border opacity pairing that
// was already the de facto standard across the app, just never named.
// `Subtle` = default resting state, `Emphasis` = active/hover/selected state.
//
// These are plain string literals, not built from a template-literal helper,
// because Tailwind's compiler statically scans source files for complete
// class names — a dynamically-interpolated `border-${color}-400/20` would
// silently produce no CSS at build time. Keep every entry a literal string.
//
// cyan/fuchsia/violet/sky are legacy aliases of indigo (see the top-of-file
// note) — kept working, not part of the canonical 5-tone palette
// (neutral/indigo/accent/amber/danger) new code should use.
export const SURFACE = {
  neutralSubtle: "border border-white/10 bg-white/[0.03]",
  neutralEmphasis: "border border-white/15 bg-white/[0.06]",
  indigoSubtle: "border border-indigo-400/20 bg-indigo-500/10",
  indigoEmphasis: "border border-indigo-400/35 bg-indigo-500/20",
  /** Canonical name for the energetic-accent surface tier. */
  accentSubtle: "border border-green-400/20 bg-green-500/10",
  accentEmphasis: "border border-green-400/35 bg-green-500/20",
  amberSubtle: "border border-amber-400/20 bg-amber-500/10",
  amberEmphasis: "border border-amber-400/35 bg-amber-500/20",
  dangerSubtle: "border border-red-400/25 bg-red-500/10",
  dangerEmphasis: "border border-red-400/40 bg-red-500/15",
  // --- legacy aliases (all resolve to indigo) ---
  cyanSubtle: "border border-indigo-400/20 bg-indigo-500/10",
  cyanEmphasis: "border border-indigo-400/35 bg-indigo-500/20",
  fuchsiaSubtle: "border border-indigo-400/20 bg-indigo-500/10",
  fuchsiaEmphasis: "border border-indigo-400/35 bg-indigo-500/20",
  violetSubtle: "border border-indigo-400/20 bg-indigo-500/10",
  violetEmphasis: "border border-indigo-400/35 bg-indigo-500/20",
  skySubtle: "border border-indigo-400/20 bg-indigo-500/10",
  skyEmphasis: "border border-indigo-400/35 bg-indigo-500/20",
  // --- legacy alias (emerald was the old name for what's now `accent`) ---
  emeraldSubtle: "border border-green-400/20 bg-green-500/10",
  emeraldEmphasis: "border border-green-400/35 bg-green-500/20",
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
