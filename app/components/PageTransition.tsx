"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { springSnappy, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

// mode="wait" (rather than a simultaneous crossfade) is deliberate here, not
// a default left in place: every page in this app renders its own full-
// height `min-h-dvh` Background, so mounting the incoming page before the
// outgoing one has unmounted would stack two full pages in normal flow --
// double height, a jumping scrollbar -- the exact layout-shift/overlap bug
// this pass is meant to remove, not reintroduce. The exit is kept short
// (springSnappy) so the "wait" is not felt as added navigation latency.
//
// Opacity-only, no y/scale: several pages render `position: fixed` elements
// as part of {children} (VyraCoach's launcher, the `create` page's
// full-screen generation overlay, Modal). A non-"none" `transform` (or
// `filter`) on this wrapper would give those descendants a new containing
// block for the transition's duration, so a `fixed` element would briefly
// slide/scale with the page instead of staying pinned to the viewport --
// exactly the overlap/misplacement bug this component exists to avoid.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reducedMotion ? REDUCED_MOTION_TRANSITION : springSnappy}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
