"use client";

import { motion, useReducedMotion } from "motion/react";
import { springSmooth, MOTION_DISTANCE_PX, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

// Mount-triggered fade + gentle rise -- the default entrance for content
// that's already in view on load (modals, cards appearing after a state
// change, form sections). For content further down the page, use
// RevealOnScroll instead (viewport-triggered, and deliberately never
// starts at opacity:0 -- see that component for why).
export function FadeIn({
  children,
  className,
  delay = 0,
  distance = MOTION_DISTANCE_PX,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
}) {
  const reducedMotion = useReducedMotion();
  const safeDistance = reducedMotion ? 0 : distance;

  return (
    <motion.div
      initial={{ opacity: 0, y: safeDistance }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? REDUCED_MOTION_TRANSITION : { ...springSmooth, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
