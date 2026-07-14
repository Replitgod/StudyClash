"use client";

import { motion } from "framer-motion";
import { springSmooth } from "@/lib/motion";

// Scroll-triggered rise for long marketing/content pages -- sections settle
// into place as the student scrolls to them instead of all being static on
// first paint. `once: true` so it never replays on scroll-back.
//
// Deliberately never animates opacity from 0: an early version faded
// sections in from opacity:0, which measured out fine on a real human
// scroll but left content sitting at opacity:0 whenever the
// IntersectionObserver didn't fire in time (fast/coarse scrolling, and
// crucially search crawlers, which generally don't simulate scrolling
// before indexing). This page carries real SEO weight (FAQPage schema,
// keyword-targeted copy) -- text must never be invisible by default.
// Worst-case failure mode here is "sits 20px low forever", never "invisible".
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 1, y: 20 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ ...springSmooth, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
