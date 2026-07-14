"use client";

import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/motion";

// Staggers the hero column's children in on mount (badge -> headline ->
// subhead -> CTAs -> trust list), instead of the whole block appearing at
// once. Mount-triggered, not scroll-triggered (Reveal.tsx) -- this is
// above the fold, so it should animate immediately on page load.
export function HeroReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainer(0.09)} className={className}>
      {children}
    </motion.div>
  );
}

export function HeroRevealItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeInUp} className={className}>
      {children}
    </motion.div>
  );
}
