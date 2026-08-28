"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeMotion } from "@/lib/motionEngine";

// The scanner cursor.
//
// A dot pinned to the pointer, a ring lagging behind it, and a rotating
// scanner bracket that opens with context text over anything carrying
// `data-cursor`. The ring also stretches along the direction of travel at
// speed, which is what makes it feel like it has mass rather than being a
// decal.
//
// Gated on hover+fine pointer and prefers-reduced-motion, and it only takes
// the real cursor away (`cursor: none`) once it has actually mounted --
// otherwise a failure here would leave the page with no pointer at all.

export function ScannerCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    setActive(true);
    document.documentElement.classList.add("cursor-none-desktop");

    const ring = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let raf = 0;
    let target = { x: ring.x, y: ring.y };
    let velocity = 0;

    const unsubscribe = subscribeMotion((m) => {
      target = { x: m.pointerX, y: m.pointerY };
      velocity = m.pointerVelocity;
    });

    const onOver = (event: PointerEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.("[data-cursor]");
      const next = el?.getAttribute("data-cursor") ?? null;
      setLabel((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("pointermove", onOver, { passive: true });

    const tick = () => {
      const dx = target.x - ring.x;
      const dy = target.y - ring.y;
      ring.x += dx * 0.16;
      ring.y += dy * 0.16;

      if (dotRef.current) {
        dotRef.current.style.transform =
          `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
      }
      if (ringRef.current) {
        // Stretch along travel: scale up on the axis of motion and squash
        // on the other, capped so it never becomes a smear.
        const speed = Math.min(0.45, velocity * 0.4);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        ringRef.current.style.transform =
          `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%) rotate(${angle}deg) scale(${1 + speed}, ${1 - speed * 0.6})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      unsubscribe();
      window.removeEventListener("pointermove", onOver);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("cursor-none-desktop");
    };
  }, []);

  if (!active) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[9999]">
      <div
        ref={ringRef}
        className="absolute left-0 top-0 flex items-center justify-center rounded-full border transition-[width,height,border-color,background-color] duration-300"
        style={{
          width: label ? 132 : 32,
          height: label ? 132 : 32,
          borderColor: label ? "var(--neon-green)" : "rgb(255 255 255 / 0.4)",
          background: label ? "rgb(0 255 102 / 0.07)" : "transparent",
          boxShadow: label ? "0 0 40px -8px rgb(0 255 102 / 0.7)" : "none",
        }}
      >
        {label && (
          <>
            {/* Scanner brackets */}
            <span
              className="absolute inset-2 rounded-full border border-dashed"
              style={{
                borderColor: "rgb(0 255 102 / 0.4)",
                animation: "radar-spin-flat 5s linear infinite",
              }}
            />
            <span
              className="max-w-[104px] select-none px-2 text-center text-[9.5px] font-semibold uppercase leading-tight tracking-[0.14em]"
              style={{ color: "var(--neon-green)" }}
            >
              {label}
            </span>
          </>
        )}
      </div>

      <div
        ref={dotRef}
        className="absolute left-0 top-0 rounded-full"
        style={{
          width: 5,
          height: 5,
          background: label ? "var(--neon-green)" : "#fff",
          boxShadow: label
            ? "0 0 14px rgb(0 255 102 / 1)"
            : "0 0 10px rgb(255 255 255 / 0.7)",
        }}
      />
    </div>
  );
}
