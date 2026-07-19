"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { springSmooth, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

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
//
// Driven by useInView + a plain `animate` prop rather than the declarative
// whileInView/viewport shorthand -- on this stack (motion 12.42.2 + Next
// 16.2.10 canary), whileInView silently never applies any style at all
// (verified with an isolated repro, reproduces in both dev and a production
// build). This means the rise motion documented above has never actually
// played anywhere it was used (terms/privacy/exams/contact) -- content
// rendered directly at its final position instead, which is exactly the
// documented safe worst case, so nothing was ever visibly broken, just
// static instead of animated.
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reducedMotion = useReducedMotion();

  const hidden = { opacity: 1, y: reducedMotion ? 0 : 20 };
  const visible = { opacity: 1, y: 0 };

  return (
    <motion.div
      ref={ref}
      initial={hidden}
      animate={inView ? visible : hidden}
      transition={reducedMotion ? REDUCED_MOTION_TRANSITION : { ...springSmooth, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
