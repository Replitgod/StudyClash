"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

// Animates a displayed number tweening from its previous value to `value`
// instead of snapping instantly -- used for score/streak/mastery-percent
// displays so a jump from 40 to 55 reads as movement, not a re-render.
// Snaps instantly under reduced motion instead of tweening.
export function useCountUp(value: number, durationSeconds = 0.6): number {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;

    if (reducedMotion) {
      setDisplay(to);
      prevRef.current = to;
      return;
    }

    const controls = animate(from, to, {
      duration: durationSeconds,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });

    prevRef.current = to;
    return () => controls.stop();
  }, [value, durationSeconds, reducedMotion]);

  return display;
}
