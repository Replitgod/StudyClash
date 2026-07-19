import type { Transition, Variants } from "motion/react";

// Shared motion language for AcedIQ's neon-battle aesthetic: quick,
// springy, a little playful -- not slow/corporate ease-in-out. Import these
// instead of inventing new timing/easing per component, so every animated
// surface in the app reads as one system rather than a pile of one-off
// tweaks.

export const springSnappy: Transition = { type: "spring", stiffness: 520, damping: 32, mass: 0.5 };
export const springBouncy: Transition = { type: "spring", stiffness: 420, damping: 14, mass: 0.7 };
export const springSmooth: Transition = { type: "spring", stiffness: 260, damping: 28 };

// Spread onto any motion.button/a/div for tactile press/hover feedback --
// the default for primary interactive elements (answer choices, quick
// actions, CTAs).
export const pressable = {
  whileHover: { scale: 1.025 },
  whileTap: { scale: 0.95 },
  transition: springSnappy,
};

// Smaller-range version for dense UI (chips, pills, small icon buttons)
// where a full pressable scale would look jumpy.
export const pressableSubtle = {
  whileHover: { scale: 1.015 },
  whileTap: { scale: 0.97 },
  transition: springSnappy,
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: springSmooth },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springBouncy },
};

export function staggerContainer(staggerDelay = 0.06, initialDelay = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: staggerDelay, delayChildren: initialDelay },
    },
  };
}

// Shared tokens for the app/components/motion/* primitives (FadeIn, SlideIn,
// StaggerContainer, etc.) -- "duration, easing, distance and stagger" named
// once so every primitive stays visually consistent instead of each one
// picking its own numbers. Mirrors app/globals.css's --duration-*/
// --ease-brand-bounce CSS custom properties as plain JS values, since
// framer/motion's `transition` prop takes numbers/strings, not CSS vars.
export const DURATION_MS = {
  fast: 150,
  base: 200,
  slow: 450,
} as const;

export const EASE_BRAND_BOUNCE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

// Standard travel distance for enter/exit slide animations (FadeIn's `y`,
// SlideIn's `x`/`y`) -- one number so a FadeIn and a SlideIn on the same
// screen travel the same visual distance.
export const MOTION_DISTANCE_PX = 16;

// Default per-child delay for StaggerContainer/StaggerItem -- same value
// staggerContainer() already defaults to, exported as a named constant so
// call sites can reference "the standard stagger" without a magic number.
export const STAGGER_DELAY_S = 0.06;

// Used by every app/components/motion/* primitive when useReducedMotion()
// is true: near-instant rather than literally 0, since a transition of
// exactly 0 can cause motion/react to skip applying the `animate` state on
// some browsers. Content still ends up in its final position/opacity --
// nothing is ever left invisible or offset, it just doesn't visibly move.
export const REDUCED_MOTION_TRANSITION: Transition = { duration: 0.01 };
