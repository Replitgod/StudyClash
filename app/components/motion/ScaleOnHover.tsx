"use client";

import { motion, useReducedMotion } from "motion/react";
import { springSnappy } from "@/lib/motion";

// Wraps any element (an image, an icon tile, a preview card) with a small
// hover lift/scale -- the generic version of what Button.tsx bakes in for
// buttons specifically. Use this for non-button interactive elements;
// use Button for anything that's actually a button/link action.
export function ScaleOnHover({
  children,
  className,
  scale = 1.03,
  lift = true,
}: {
  children: React.ReactNode;
  className?: string;
  scale?: number;
  lift?: boolean;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={reducedMotion ? undefined : { scale, y: lift ? -2 : 0 }}
      whileTap={reducedMotion ? undefined : { scale: scale - 0.05 }}
      transition={springSnappy}
      className={className}
    >
      {children}
    </motion.div>
  );
}
