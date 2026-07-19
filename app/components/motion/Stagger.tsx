"use client";

import { motion, useReducedMotion } from "motion/react";
import { fadeInUp, staggerContainer, STAGGER_DELAY_S, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

// Pair: wrap a list/grid in StaggerContainer, wrap each child in
// StaggerItem. Children reveal in sequence instead of popping in at once --
// the standard treatment for feature grids, card collections, and list
// results. Mount-triggered by default; pass `viewportTriggered` to defer
// until the container scrolls into view (long marketing sections).
export function StaggerContainer({
  children,
  className,
  staggerDelay = STAGGER_DELAY_S,
  initialDelay = 0,
  viewportTriggered = false,
}: {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  initialDelay?: number;
  viewportTriggered?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const viewportProps = viewportTriggered
    ? { whileInView: "visible" as const, viewport: { once: true, margin: "-80px" } }
    : { animate: "visible" as const };

  return (
    <motion.div
      initial="hidden"
      {...viewportProps}
      variants={staggerContainer(reducedMotion ? 0 : staggerDelay, reducedMotion ? 0 : initialDelay)}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      variants={reducedMotion ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: REDUCED_MOTION_TRANSITION } } : fadeInUp}
      className={className}
    >
      {children}
    </motion.div>
  );
}
