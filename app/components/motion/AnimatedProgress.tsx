"use client";

import { motion, useReducedMotion } from "motion/react";
import { springSmooth, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

// Real animated progress bar -- replaces the raw `<div style={{width}}
// className="transition-all duration-300"/>` pattern used ad hoc across the
// app (battle progress, mastery bars, domain breakdowns). Animates
// `scaleX` (a transform), not `width` -- width/height changes force layout
// recalculation on every frame; a full-width bar scaled from its left edge
// is the standard performant way to animate a progress fill and is what
// the redesign's own performance requirements ask for ("prefer animating
// transform/opacity... avoid unnecessary animation of width/height").
export function AnimatedProgress({
  value,
  max = 100,
  className,
  barClassName = "bg-gradient-to-r from-indigo-400 to-indigo-400",
  trackClassName = "bg-white/10",
  heightClassName = "h-2",
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  trackClassName?: string;
  heightClassName?: string;
}) {
  const reducedMotion = useReducedMotion();
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`overflow-hidden rounded-full ${heightClassName} ${trackClassName} ${className || ""}`}>
      <motion.div
        className={`h-full w-full origin-left rounded-full ${barClassName}`}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: percent / 100 }}
        transition={reducedMotion ? REDUCED_MOTION_TRANSITION : springSmooth}
      />
    </div>
  );
}
