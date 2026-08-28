"use client";

import { useEffect, useRef, useState } from "react";

// The contextual cursor.
//
// A dot that trails the pointer and expands into a labelled tracker over
// anything carrying `data-cursor="…"`. The label is the point: the cursor
// tells you what the thing under it will do, so a card does not need a
// permanent "Fix gap" chip bolted to its corner.
//
// Three things it must not do:
//
//   - appear on touch. There is no cursor to replace, and a fixed dot is
//     just litter. Gated on a hover+fine-pointer media query.
//   - run under prefers-reduced-motion. It is pure decoration.
//   - hide the real cursor before it is ready. `cursor: none` is only
//     applied once this has actually mounted and taken over, otherwise a
//     failure here leaves the page with no pointer at all.

const LERP = 0.18;

export function NeonCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fine =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!fine || reduced) return;

    setActive(true);
    document.documentElement.classList.add("cursor-none-desktop");

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ring = { x: target.x, y: target.y };
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;

      // Walk up from the element under the pointer to find the nearest
      // labelled ancestor, so a label on a card also applies to the text
      // inside it.
      const el = (event.target as HTMLElement | null)?.closest?.("[data-cursor]");
      const next = el?.getAttribute("data-cursor") ?? null;
      setLabel((prev) => (prev === next ? prev : next));
    };

    const tick = () => {
      // The dot is pinned to the pointer; the ring eases behind it. That lag
      // is what makes it feel weighted rather than glued on.
      ring.x += (target.x - ring.x) * LERP;
      ring.y += (target.y - ring.y) * LERP;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%)`;
      }
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove("cursor-none-desktop");
    };
  }, []);

  if (!active) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[9999]">
      <div
        ref={ringRef}
        className="absolute left-0 top-0 flex items-center justify-center rounded-full border transition-[width,height,background-color,border-color] duration-300"
        style={{
          width: label ? 108 : 34,
          height: label ? 108 : 34,
          borderColor: label ? "var(--neon-green)" : "rgb(255 255 255 / 0.35)",
          background: label ? "rgb(180 255 57 / 0.1)" : "transparent",
          backdropFilter: label ? "blur(2px)" : undefined,
        }}
      >
        {label && (
          <span
            className="select-none px-2 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.12em]"
            style={{ color: "var(--neon-green)" }}
          >
            {label}
          </span>
        )}
      </div>

      <div
        ref={dotRef}
        className="absolute left-0 top-0 rounded-full"
        style={{
          width: 6,
          height: 6,
          background: label ? "var(--neon-green)" : "#fff",
          boxShadow: label
            ? "0 0 12px rgb(180 255 57 / 0.9)"
            : "0 0 10px rgb(255 255 255 / 0.6)",
        }}
      />
    </div>
  );
}
