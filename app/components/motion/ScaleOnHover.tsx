"use client";

import { motion } from "motion/react";
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
  return (
    <motion.div
      whileHover={{ scale, y: lift ? -2 : 0 }}
      whileTap={{ scale: scale - 0.05 }}
      transition={springSnappy}
      className={className}
    >
      {children}
    </motion.div>
  );
}
