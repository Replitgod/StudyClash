"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { springBouncy, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

// Lightweight, generic success celebration -- a checkmark pop with a small
// radiating ring, for form submissions/save confirmations/task-complete
// moments anywhere in the app. Deliberately much simpler than
// ConfettiBurst (16-piece particle fall): that component is specifically
// for the battle-win moment; this is for smaller, frequent "that worked"
// feedback where full confetti would be excessive (every form save
// shouldn't feel like winning a battle).
export function SuccessBurst({ show, size = 40 }: { show: boolean; size?: number }) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none relative inline-flex items-center justify-center"
          style={{ width: size, height: size }}
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.8 }}
          transition={reducedMotion ? REDUCED_MOTION_TRANSITION : springBouncy}
        >
          {/* The radiating ring is a one-shot expand, not a loop, but it's
              still a largish scale animation -- skip it entirely under
              reduced motion rather than trying to tone it down. */}
          {!reducedMotion && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-green-400/60"
              initial={{ scale: 0.6, opacity: 0.8 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          )}
          <span
            className="flex items-center justify-center rounded-full bg-green-500/20 text-green-300"
            style={{ width: size * 0.7, height: size * 0.7 }}
            aria-hidden="true"
          >
            ✓
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
