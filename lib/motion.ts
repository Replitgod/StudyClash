import type { Transition, Variants } from "framer-motion";

// Shared motion language for StudyClash's neon-battle aesthetic: quick,
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
