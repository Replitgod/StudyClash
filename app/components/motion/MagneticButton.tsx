"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useReducedMotion } from "motion/react";

// Magnetic CTA -- the button eases toward the cursor while it hovers, and
// the label drifts a touch further for a parallax depth cue, then both slide
// home on exit. Built on GSAP's `quickTo`: a single reusable tween per
// property that we re-target every pointermove, which is dramatically
// smoother and cheaper than spawning a tween per frame. `power3.out` gives
// the trailing "weighted" follow that reads as premium rather than snapping.
//
// This is deliberately GSAP, not motion/react -- cursor-tracked
// interpolation with per-property quickTo setters is exactly what GSAP is
// best at, and it's the class of micro-interaction that separates a
// world-class CTA from a normal one. Fully disabled under reduced-motion.
export function MagneticButton({
  href,
  children,
  className,
  strength = 16,
  ariaLabel,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** Max px the button travels toward the cursor. */
  strength?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;
    const label = labelRef.current;

    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
    const lxTo = label ? gsap.quickTo(label, "x", { duration: 0.5, ease: "power3.out" }) : null;
    const lyTo = label ? gsap.quickTo(label, "y", { duration: 0.5, ease: "power3.out" }) : null;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      xTo(nx * strength);
      yTo(ny * strength);
      lxTo?.(nx * strength * 0.4);
      lyTo?.(ny * strength * 0.4);
    };
    const onLeave = () => {
      xTo(0);
      yTo(0);
      lxTo?.(0);
      lyTo?.(0);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(el);
      gsap.set(el, { x: 0, y: 0 });
      if (label) {
        gsap.killTweensOf(label);
        gsap.set(label, { x: 0, y: 0 });
      }
    };
  }, [reducedMotion, strength]);

  return (
    <Link ref={ref} href={href} aria-label={ariaLabel} className={className}>
      <span ref={labelRef} className="inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </Link>
  );
}
