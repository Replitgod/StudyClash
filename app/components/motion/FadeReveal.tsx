"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

// Homepage-only scroll reveal matching the approved "Premium Dark" artifact
// exactly: opacity 0->1 + translateY(26px)->0 over 0.7s ease, once per
// element. Deliberately NOT the shared app/components/ui/Reveal.tsx (which
// never animates opacity, for a documented SEO/crawler-safety reason) --
// that tradeoff was explicitly accepted here in favor of matching the
// artifact's exact look.
//
// Driven by the useInView hook rather than the declarative
// whileInView/viewport shorthand: on this stack (motion 12.42.2 + Next
// 16.2.10 canary), whileInView silently never applies ANY style -- not even
// `initial` -- verified with an isolated repro (reproduces in both `next
// dev` and a production build, so it's not a Strict Mode double-invoke
// artifact). useInView + a plain `animate` prop that is ALWAYS a concrete
// object (never `undefined` on either branch -- passing `animate={undefined}`
// on the "not in view yet" branch was the actual bug, since Motion appears
// to skip all style management for an instance whenever `animate` is
// undefined, including its `initial` style) works correctly.
export function FadeReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const reducedMotion = useReducedMotion();

  const hidden = { opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 26 };
  const visible = { opacity: 1, y: 0 };

  return (
    <motion.div
      ref={ref}
      initial={hidden}
      animate={inView ? visible : hidden}
      transition={reducedMotion ? { duration: 0.01 } : { duration: 0.7, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
