"use client";

import { motion, useReducedMotion } from "motion/react";
import { springSmooth, MOTION_DISTANCE_PX, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

type Direction = "up" | "down" | "left" | "right";

function offsetFor(direction: Direction, distance: number): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: distance };
    case "down":
      return { x: 0, y: -distance };
    case "left":
      return { x: distance, y: 0 };
    case "right":
      return { x: -distance, y: 0 };
  }
}

// Directional mount-triggered entrance -- e.g. a side panel sliding in from
// the right, a toast rising from below. For simple "fade up" use FadeIn
// instead (same underlying motion, clearer name for the common case).
export function SlideIn({
  children,
  className,
  direction = "up",
  delay = 0,
  distance = MOTION_DISTANCE_PX,
}: {
  children: React.ReactNode;
  className?: string;
  direction?: Direction;
  delay?: number;
  distance?: number;
}) {
  const reducedMotion = useReducedMotion();
  const offset = offsetFor(direction, reducedMotion ? 0 : distance);
  return (
    <motion.div
      initial={{ opacity: 0, x: offset.x, y: offset.y }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: offset.x, y: offset.y }}
      transition={reducedMotion ? REDUCED_MOTION_TRANSITION : { ...springSmooth, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
