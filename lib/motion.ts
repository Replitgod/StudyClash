import type { Transition, Variants } from "motion/react";

/** Premium settled ease — entrances, section reveals (Wix/carrier-site quality). */
export const EASE_PREMIUM_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_PREMIUM_IN_OUT: [number, number, number, number] = [0.45, 0, 0.25, 1];
export const EASE_BRAND_BOUNCE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

export const transitionPremium: Transition = {
  duration: 0.45,
  ease: EASE_PREMIUM_OUT,
};

export const transitionFast: Transition = {
  duration: 0.15,
  ease: EASE_PREMIUM_OUT,
};

export const transitionBase: Transition = {
  duration: 0.25,
  ease: EASE_PREMIUM_IN_OUT,
};

export const transitionReveal: Transition = {
  duration: 0.55,
  ease: EASE_PREMIUM_OUT,
};

/** Legacy springs — battle UI only; marketing prefers tween presets above. */
export const springSnappy: Transition = { type: "spring", stiffness: 520, damping: 32, mass: 0.5 };
export const springBouncy: Transition = { type: "spring", stiffness: 420, damping: 14, mass: 0.7 };
export const springSmooth: Transition = { type: "spring", stiffness: 260, damping: 28 };

export const pressable = {
  whileHover: { scale: 1.02, y: -1 },
  whileTap: { scale: 0.98, y: 0 },
  transition: transitionBase,
};

export const pressableSubtle = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.98 },
  transition: transitionFast,
};

export const pressableMarketing = {
  whileHover: { scale: 1.015, y: -1 },
  whileTap: { scale: 0.985, y: 0 },
  transition: transitionBase,
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitionPremium },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: transitionPremium },
};

export const fadeInUpSubtle: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: transitionReveal },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transitionPremium },
};

export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE_PREMIUM_OUT },
  },
};

export const modalOpen: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transitionPremium },
  exit: { opacity: 0, scale: 0.98, y: 8, transition: transitionFast },
};

export const drawerOpen: Variants = {
  hidden: { opacity: 0, y: -16 },
  visible: { opacity: 1, y: 0, transition: transitionPremium },
  exit: { opacity: 0, y: -12, transition: transitionFast },
};

export const drawerSlideRight: Variants = {
  hidden: { opacity: 0, x: "100%" },
  visible: { opacity: 1, x: 0, transition: transitionPremium },
  exit: { opacity: 0, x: "100%", transition: transitionFast },
};

export const successPop: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: EASE_PREMIUM_OUT } },
};

export const errorShake: Variants = {
  shake: {
    x: [0, -6, 5, -3, 2, 0],
    transition: { duration: 0.4, ease: EASE_PREMIUM_IN_OUT },
  },
};

export const questionTransition: Variants = {
  enter: { opacity: 0, x: 20 },
  center: { opacity: 1, x: 0, transition: transitionPremium },
  exit: { opacity: 0, x: -20, transition: transitionFast },
};

export const resultsRevealSequence = {
  background: { delay: 0, duration: 0.35 },
  winner: { delay: 0.12, duration: 0.45 },
  score: { delay: 0.22, duration: 0.5 },
  roast: { delay: 0.35, duration: 0.45 },
  weakTopics: { delay: 0.48, duration: 0.45 },
  actions: { delay: 0.58, duration: 0.4 },
} as const;

export function staggerContainer(staggerDelay = 0.07, initialDelay = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: staggerDelay, delayChildren: initialDelay },
    },
  };
}

export const DURATION_MS = {
  fast: 150,
  base: 250,
  slow: 450,
  reveal: 550,
} as const;

export const MOTION_DISTANCE_PX = 20;
export const STAGGER_DELAY_S = 0.07;
export const STAGGER_DELAY_MOBILE_S = 0.04;

export const REDUCED_MOTION_TRANSITION: Transition = { duration: 0.01 };

/** Viewport scroll reveal defaults for RevealOnScroll / marketing sections. */
export const SCROLL_REVEAL_VIEWPORT = { once: true, margin: "-8% 0px -8% 0px" as const };
