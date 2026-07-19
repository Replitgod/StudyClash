"use client";

import { motion, useReducedMotion } from "motion/react";

// Gentle ambient float + small cursor-responsive tilt, for hero/decorative
// visual layers (the redesign brief's "gentle floating layers, small
// cursor-responsive depth on desktop, no heavy parallax on mobile").
// Deliberately NOT for real UI cards that hold content someone reads or
// clicks -- constant motion on something a student is trying to read is
// exactly the kind of thing the brief's performance/accessibility rules
// warn against ("never hide content behind an animation", avoid
// unbounded mouse-move state updates). Use ScaleOnHover/Button for those.
//
// The looping float is intentionally tiny (6px, 4s) and stops entirely
// under reduced motion rather than being toned down, per the brief's
// explicit "remove looping movement" rule -- a small loop is still a loop.
export function FloatingCard({
  children,
  className,
  floatDistance = 6,
  floatDurationSeconds = 4,
  tiltStrength = 6,
}: {
  children: React.ReactNode;
  className?: string;
  floatDistance?: number;
  floatDurationSeconds?: number;
  tiltStrength?: number;
}) {
  const reducedMotion = useReducedMotion();

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--tilt-x", `${(-relY * tiltStrength).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(relX * tiltStrength).toFixed(2)}deg`);
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <motion.div
      className={className}
      style={{
        transform: reducedMotion
          ? undefined
          : "perspective(800px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
        transition: "transform 0.2s ease-out",
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      animate={
        reducedMotion
          ? undefined
          : { y: [0, -floatDistance, 0] }
      }
      transition={
        reducedMotion
          ? undefined
          : { duration: floatDurationSeconds, repeat: Infinity, ease: "easeInOut" }
      }
    >
      {children}
    </motion.div>
  );
}
