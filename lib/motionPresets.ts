import type { Transition, Variants } from "motion/react";
import {
  DURATION_MS,
  EASE_BRAND_BOUNCE,
  MOTION_DISTANCE_PX,
  REDUCED_MOTION_TRANSITION,
  springBouncy,
  springSmooth,
  springSnappy,
  staggerContainer,
} from "./motion";

export { REDUCED_MOTION_TRANSITION, staggerContainer };

/** Fade in — default entrance for text and icons. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION_MS.base / 1000, ease: EASE_BRAND_BOUNCE } },
};

/** Fade + slide up — section reveals, cards. */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: MOTION_DISTANCE_PX },
  visible: { opacity: 1, y: 0, transition: springSmooth },
};

/** Staggered children container — lists, feature grids. */
export const staggerChildren = (delay = 0.06) => staggerContainer(delay);

/** Section reveal on scroll — used with RevealOnScroll. */
export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_MS.slow / 1000, ease: [0.16, 1, 0.3, 1] } },
};

/** Modal panel entrance. */
export const modalOpen: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, scale: 0.98, y: 8, transition: { duration: DURATION_MS.fast / 1000 } },
};

/** Drawer slide-up (mobile) / slide-in (desktop). */
export const drawerOpen: Variants = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_MS.base / 1000, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: "100%", transition: { duration: DURATION_MS.fast / 1000 } },
};

/** Button press micro-interaction. */
export const buttonPress = {
  whileHover: { scale: 1.02, y: -1, transition: springSnappy },
  whileTap: { scale: 0.97, y: 0, transition: springBouncy },
};

/** Success burst — checkmark, copied state. */
export const successPop: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: springBouncy },
};

/** Error shake — form validation. */
export const errorShake: Variants = {
  shake: {
    x: [0, -8, 8, -5, 5, 0],
    transition: { duration: 0.4 },
  },
};

/** Score count-up wrapper — pair with AnimatedNumber. */
export const scoreReveal: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: springBouncy },
};

/** Progress bar fill — use with width animation. */
export const progressFill: Transition = {
  duration: DURATION_MS.slow / 1000,
  ease: [0.16, 1, 0.3, 1],
};

/** Question card transition between rounds. */
export const questionTransition: Variants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0, transition: springSmooth },
  exit: { opacity: 0, x: -24, transition: { duration: DURATION_MS.fast / 1000 } },
};

/** Results reveal sequence — winner, scores, roast. */
export const resultsReveal: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: DURATION_MS.base / 1000, ease: EASE_BRAND_BOUNCE },
  }),
};
