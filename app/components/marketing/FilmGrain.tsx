"use client";

import { useEffect, useRef } from "react";

// Real-time film grain.
//
// Generates a small tile of random luminance into an ImageData buffer and
// repaints it a few times a second. A static SVG turbulence is cheaper but
// reads as a screen-door pattern once you notice it does not move; real
// grain has to actually change.
//
// Two things keep it cheap:
//   - the tile is small (a few hundred pixels square) and drawn scaled up,
//     so per-frame work is a few hundred thousand random values at most,
//     not one per screen pixel;
//   - it repaints at ~12fps rather than 60. Film grain at full frame rate
//     looks wrong anyway -- it is meant to flicker, not shimmer.

const TILE = 180;
const FPS = 12;

export function FilmGrain() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    canvas.width = TILE;
    canvas.height = TILE;

    const image = ctx.createImageData(TILE, TILE);
    const buffer = new Uint32Array(image.data.buffer);

    let raf = 0;
    let last = 0;
    const interval = 1000 / FPS;

    const draw = (now: number) => {
      if (now - last >= interval) {
        last = now;
        for (let i = 0; i < buffer.length; i += 1) {
          // Random grey with a low alpha, written as one 32-bit value:
          // 0xAABBGGRR little-endian.
          const v = (Math.random() * 255) | 0;
          const a = (Math.random() * 42) | 0;
          buffer[i] = (a << 24) | (v << 16) | (v << 8) | v;
        }
        ctx.putImageData(image, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="noise-canvas"
      // The tile is tiny; CSS stretches it across the viewport, and
      // image-rendering keeps the grain crisp rather than smoothly blurred.
      style={{ width: "100%", height: "100%", imageRendering: "pixelated" }}
    />
  );
}
