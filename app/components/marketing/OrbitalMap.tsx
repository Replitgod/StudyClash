"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The live knowledge map.
//
// Nodes orbit a centre in 3D. Decaying ones dim, flicker and drift
// outward as you stay on the page -- the further out, the more forgotten.
// Clicking one runs a spring correction that snaps it back to its true
// radius and flips it green.
//
// The decay is real time, not a canned animation: a node's radius is a
// function of how long it has been left alone, so a visitor who reads the
// section for thirty seconds genuinely watches knowledge drift away. That
// is the whole argument the section is making, so faking it with a loop
// would undercut the point.
//
// Rendered on a canvas rather than as DOM nodes. Twelve elements each with
// their own transform, glow and flicker would be twelve composited layers
// repainting every frame; one canvas is a single draw call and stays smooth
// on a laptop.

type Node = {
  id: string;
  label: string;
  /** Orbit angle in radians. */
  angle: number;
  /** Orbital speed, radians per second. */
  speed: number;
  /** Vertical position in the orbit, -1..1. */
  tilt: number;
  /** The radius this node belongs at, 0..1 of the stage. */
  baseRadius: number;
  /** Where it currently is. Grows while decaying. */
  radius: number;
  decaying: boolean;
  mastery: number;
  /** Spring velocity for the snap-back correction. */
  vRadius: number;
  fixedAt: number | null;
};

const SEED: Array<Omit<Node, "radius" | "vRadius" | "fixedAt">> = [
  { id: "eq", label: "Equilibrium", angle: 0.0, speed: 0.10, tilt: 0.30, baseRadius: 0.78, decaying: true, mastery: 41 },
  { id: "st", label: "Stoichiometry", angle: 0.9, speed: -0.08, tilt: -0.52, baseRadius: 0.60, decaying: false, mastery: 88 },
  { id: "th", label: "Thermo", angle: 1.8, speed: 0.12, tilt: 0.68, baseRadius: 0.92, decaying: false, mastery: 72 },
  { id: "ki", label: "Kinetics", angle: 2.7, speed: -0.11, tilt: -0.20, baseRadius: 0.70, decaying: true, mastery: 55 },
  { id: "ac", label: "Acids & Bases", angle: 3.6, speed: 0.09, tilt: 0.14, baseRadius: 1.0, decaying: false, mastery: 93 },
  { id: "re", label: "Redox", angle: 4.5, speed: -0.13, tilt: -0.74, baseRadius: 0.84, decaying: false, mastery: 64 },
  { id: "gas", label: "Gas Laws", angle: 5.5, speed: 0.07, tilt: 0.50, baseRadius: 0.55, decaying: true, mastery: 37 },
];

const EDGES: Array<[string, string]> = [
  ["eq", "st"], ["eq", "ki"], ["st", "th"], ["th", "ac"],
  ["ki", "ac"], ["re", "ki"], ["re", "eq"], ["gas", "st"], ["gas", "th"],
];

/** How far a forgotten node drifts past its true radius, at most. */
const MAX_DRIFT = 0.5;
/** Seconds for decay to reach maximum drift. */
const DECAY_PERIOD = 26;

export function OrbitalMap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<string | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  // Screen positions from the last frame, for hit-testing clicks.
  const screenRef = useRef<Map<string, { x: number; y: number; r: number }>>(new Map());

  // The simulation array is created once and then mutated in place by the
  // draw loop -- sixty state updates a second would be pointless work.
  // Lazy state rather than a ref so it can be read during render without
  // reaching into a ref, which React rightly complains about.
  const [nodes] = useState<Node[]>(() =>
    SEED.map((n) => ({ ...n, radius: n.baseRadius, vRadius: 0, fixedAt: null }))
  );

  // What the *UI* needs to re-render on: which ids are still decaying.
  // Mutating `nodes` alone would never repaint the buttons below.
  const [decayingIds, setDecayingIds] = useState<string[]>(() =>
    SEED.filter((n) => n.decaying).map((n) => n.id)
  );
  const [fixedCount, setFixedCount] = useState(0);

  const fix = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node || !node.decaying) return;
      node.decaying = false;
      node.fixedAt = performance.now();
      node.mastery = Math.min(99, node.mastery + 34);
      // Kick the spring inward so the correction reads as a snap, not a glide.
      node.vRadius = -0.9;
      setDecayingIds((ids) => ids.filter((x) => x !== id));
      setFixedCount((c) => c + 1);
    },
    [nodes]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    const startedAt = last;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - startedAt) / 1000;

      const cx = width / 2;
      const cy = height / 2;
      // Separate axis scales. A single min(w,h) scale draws a flat band
      // across a non-square canvas and leaves most of it empty; scaling
      // each axis to its own dimension fills the box.
      const scaleX = width * 0.38;
      const scaleY = height * 0.36;

      ctx.clearRect(0, 0, width, height);

      const positions = new Map<string, { x: number; y: number; z: number; r: number }>();

      for (const node of nodes) {
        if (!reduced) node.angle += node.speed * dt;

        if (node.decaying) {
          // Drift outward on an ease-out curve, so most of the movement
          // happens early and it never runs away off-screen.
          const t = Math.min(1, elapsed / DECAY_PERIOD);
          node.radius = node.baseRadius + MAX_DRIFT * (1 - Math.pow(1 - t, 2));
        } else {
          // Critically damped spring home.
          const k = 26;
          const damping = 9;
          const accel = (node.baseRadius - node.radius) * k - node.vRadius * damping;
          node.vRadius += accel * dt;
          node.radius += node.vRadius * dt;
        }

        // Project the orbit into 2D with a fixed camera tilt.
        const x3 = Math.cos(node.angle) * node.radius;
        const z3 = Math.sin(node.angle) * node.radius;
        const y3 = node.tilt * node.radius * 0.95;

        // Perspective divide, centred on 1 so depth reads as depth without
        // shrinking the whole graph into the middle of its canvas.
        const depth = 1 / (1.18 - z3 * 0.3);
        positions.set(node.id, {
          x: cx + x3 * scaleX * depth,
          y: cy + y3 * scaleY * depth,
          z: z3,
          r: (node.decaying ? 5.5 : 7) * depth,
        });
      }

      // Edges first, so nodes sit on top.
      ctx.lineWidth = 1;
      for (const [a, b] of EDGES) {
        const pa = positions.get(a);
        const pb = positions.get(b);
        const na = nodes.find((n) => n.id === a);
        const nb = nodes.find((n) => n.id === b);
        if (!pa || !pb || !na || !nb) continue;
        const weak = na.decaying || nb.decaying;
        const depth = (pa.z + pb.z) / 2;
        ctx.strokeStyle = weak
          ? `rgba(244, 63, 94, ${0.12 + depth * 0.16})`
          : `rgba(255, 255, 255, ${0.06 + depth * 0.1})`;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // Nodes, painted back to front.
      const screen = new Map<string, { x: number; y: number; r: number }>();
      const ordered = nodes
        .slice()
        .sort((a, b) => (positions.get(a.id)!.z ?? 0) - (positions.get(b.id)!.z ?? 0));

      for (const node of ordered) {
        const p = positions.get(node.id)!;
        screen.set(node.id, { x: p.x, y: p.y, r: Math.max(16, p.r * 3.4) });

        const isHover = hoverRef.current === node.id;

        // Flicker only while decaying: a failing signal, not a heartbeat.
        const flicker = node.decaying && !reduced
          ? 0.62 + Math.abs(Math.sin(elapsed * 7 + node.angle * 3)) * 0.38
          : 1;

        const justFixed = node.fixedAt !== null && now - node.fixedAt < 900;
        const colour = node.decaying ? "244, 63, 94" : "52, 227, 155";

        // Glow
        const glowRadius = p.r * (isHover ? 7 : justFixed ? 9 : 5);
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        gradient.addColorStop(0, `rgba(${colour}, ${0.55 * flicker})`);
        gradient.addColorStop(1, `rgba(${colour}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(${colour}, ${flicker})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (isHover ? 1.5 : 1), 0, Math.PI * 2);
        ctx.fill();

        // Snap ring
        if (justFixed) {
          const t = (now - node.fixedAt!) / 900;
          ctx.strokeStyle = `rgba(52, 227, 155, ${(1 - t) * 0.85})`;
          ctx.lineWidth = 2 * (1 - t) + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + t * 46, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Label
        ctx.font = `600 ${Math.max(9, 11 * (0.8 + p.z * 0.3))}px Archivo, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = node.decaying
          ? `rgba(255, 150, 170, ${0.6 + p.z * 0.35})`
          : `rgba(200, 214, 230, ${0.5 + p.z * 0.35})`;
        ctx.fillText(node.label.toUpperCase(), p.x, p.y - p.r - 9);

        ctx.fillStyle = `rgba(255,255,255,${0.35 + p.z * 0.3})`;
        ctx.font = `500 ${Math.max(8, 10 * (0.8 + p.z * 0.3))}px ui-monospace, monospace`;
        ctx.fillText(String(Math.round(node.mastery)), p.x, p.y + p.r + 15);
      }

      screenRef.current = screen;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [nodes]);

  const hitTest = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    for (const [id, p] of screenRef.current) {
      if (Math.hypot(p.x - x, p.y - y) <= p.r) return id;
    }
    return null;
  }, []);

  const decayingLeft = decayingIds.length;

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-[min(74vw,440px)] w-full cursor-pointer"
        onPointerMove={(event) => {
          const id = hitTest(event);
          hoverRef.current = id;
          const node = id ? nodes.find((n) => n.id === id) : null;
          setHoverLabel(node && node.decaying ? node.label : null);
        }}
        onPointerLeave={() => {
          hoverRef.current = null;
          setHoverLabel(null);
        }}
        onClick={(event) => {
          const id = hitTest(event as unknown as React.PointerEvent<HTMLCanvasElement>);
          if (id) fix(id);
        }}
        role="img"
        aria-label={`Orbital knowledge map. ${decayingLeft} concepts currently decaying.`}
      />

      {/* Keyboard-reachable equivalents. A canvas cannot be tabbed into, so
          the same actions exist as real buttons rather than being
          mouse-only. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {decayingIds.map((id) => {
          const label = SEED.find((n) => n.id === id)?.label ?? id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => fix(id)}
              data-cursor="Click to fix the gap"
              className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-all hover:brightness-125"
              style={{
                border: "1px solid var(--accent-line)",
                background: "var(--accent-soft)",
                color: "var(--accent-bright)",
              }}
            >
              Fix {label}
            </button>
          );
        })}
        {decayingLeft === 0 && (
          <span
            className="text-[12px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--neon-green)" }}
          >
            All gaps closed — {fixedCount} recovered
          </span>
        )}
      </div>

      <p className="mt-4 text-[13px]" style={{ color: "var(--text-3)" }} aria-live="polite">
        {hoverLabel
          ? `${hoverLabel} is being forgotten. Click it to run a repair.`
          : decayingLeft > 0
            ? `${decayingLeft} concepts drifting. The longer you leave them, the further they go.`
            : "Everything is holding. This is what the app is trying to keep true."}
      </p>
    </div>
  );
}
