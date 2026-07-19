"use client";

import { motion, useReducedMotion } from "motion/react";
import { REDUCED_MOTION_TRANSITION } from "@/lib/motion";

// Wraps content that should shake once when `trigger` changes (an invalid
// form submit, a wrong battle answer) -- restrained by design per the
// redesign brief ("avoid harsh red flashing"): a small horizontal shake,
// no color change of its own (the caller still owns error styling/color).
// Increment a counter and pass it as `trigger` to fire on each new error,
// even if the error message text is identical to the last one.
//
// Keying the element on `trigger` forces a remount on every new error,
// which is what actually restarts the `animate` keyframe sequence -- a
// static `animate` prop only plays once per mount, not once per prop
// change, so this is simpler and more reliable than trying to imperatively
// retrigger a persistent element.
export function ErrorShake({
  children,
  className,
  trigger,
}: {
  children: React.ReactNode;
  className?: string;
  trigger: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      key={trigger}
      className={className}
      animate={reducedMotion ? undefined : { x: [0, -6, 5, -3, 2, 0] }}
      transition={reducedMotion ? REDUCED_MOTION_TRANSITION : { duration: 0.4, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}
