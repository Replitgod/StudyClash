"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

// The Gap Locator.
//
// A rotating radar of one subject's sub-skills. Weak axes are drawn in
// decay magenta and pulse; hovering an axis holds the rotation and reveals
// what recovering it is worth.
//
// Built as SVG on a CSS 3D stage rather than WebGL. For six axes and a
// slow rotation that is the right tool: it renders identically everywhere,
// stays crisp at any density, costs no bundle, and the labels remain real
// text that a screen reader can read. A canvas would have bought nothing
// here except weight.
//
// The rotation is a CSS transform on a wrapper, so it composites off the
// main thread and keeps running smoothly while the page scrolls.

type Axis = {
  label: string;
  /** Current modelled mastery, 0-100. */
  mastery: number;
  /** What it would be after one repair session. */
  recovered: number;
  decaying: boolean;
};

const AXES: Axis[] = [
  { label: "Functions", mastery: 94, recovered: 96, decaying: false },
  { label: "Quadratics", mastery: 81, recovered: 90, decaying: false },
  { label: "Exponentials", mastery: 73, recovered: 86, decaying: false },
  { label: "Radicals", mastery: 51, recovered: 79, decaying: true },
  { label: "Complex nums", mastery: 38, recovered: 71, decaying: true },
  { label: "Sequences", mastery: 66, recovered: 84, decaying: false },
];

const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 112;

/** cos(58deg) -- how much the stage tilt compresses the radar vertically. */
const TILT_SQUASH = 0.53;

function pointAt(index: number, value: number, total: number) {
  // Start at 12 o'clock and go clockwise.
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / 100) * RADIUS;
  return {
    x: CENTER + Math.cos(angle) * r,
    y: CENTER + Math.sin(angle) * r,
  };
}

export function GapRadar() {
  const [hovered, setHovered] = useState<number | null>(null);
  const spinRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  // Rotation is paused while an axis is being inspected -- a target that
  // keeps moving under the cursor is a target you cannot read.
  useEffect(() => {
    const node = spinRef.current;
    if (!node) return;
    node.style.animationPlayState =
      hovered === null && !reduced ? "running" : "paused";
  }, [hovered, reduced]);

  const shape = AXES.map((axis, i) => pointAt(i, axis.mastery, AXES.length));
  const recoveredShape = AXES.map((axis, i) =>
    pointAt(i, axis.recovered, AXES.length)
  );
  const active = hovered === null ? null : AXES[hovered];

  return (
    <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
      {/* ---------------- Copy ---------------- */}
      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.24em]"
          style={{ color: "var(--neon-decay)" }}
        >
          Gap locator
        </p>
        <h2
          id="gaps"
          className="brutal mt-4 text-[clamp(2.2rem,5.6vw,4.4rem)]"
          style={{ color: "var(--text-1)", ["--wdth" as string]: 94 }}
        >
          Watch it<br />
          <span className="neon-green glow-green">decay.</span>
        </h2>
        <p
          className="mt-6 max-w-md text-[16px] leading-relaxed"
          style={{ color: "var(--text-2)" }}
        >
          A percentage cannot tell a topic you nailed this morning from the
          same score five weeks ago. AceDecks models forgetting directly — so
          it can flag a concept while it is slipping, not after it is gone.
        </p>

        <div
          className="mt-8 rounded-[var(--radius-lg)] p-5"
          style={{
            border: "1px solid rgb(255 255 255 / 0.1)",
            background: "rgb(11 13 16 / 0.6)",
          }}
          aria-live="polite"
        >
          {active ? (
            <>
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: active.decaying ? "var(--neon-decay)" : "var(--neon-blue)" }}
              >
                {active.label}
              </p>
              <div className="mt-3 flex items-end gap-3">
                <span
                  className="brutal text-[2.6rem] leading-none"
                  style={{ color: "var(--text-1)" }}
                >
                  {active.mastery}
                </span>
                <span className="mb-1 text-[13px]" style={{ color: "var(--text-3)" }}>
                  now
                </span>
                <span className="mb-1 text-[18px]" style={{ color: "var(--text-4)" }}>
                  →
                </span>
                <span
                  className="brutal text-[2.6rem] leading-none neon-green glow-green"
                >
                  {active.recovered}
                </span>
                <span className="mb-1 text-[13px]" style={{ color: "var(--text-3)" }}>
                  recovered
                </span>
              </div>
              <p className="mt-3 text-[13px]" style={{ color: "var(--text-2)" }}>
                {active.decaying
                  ? "Actively being forgotten. Cheapest thing here to save."
                  : "Holding. Next review is already scheduled."}
              </p>
            </>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
              Hover an axis to see what recovering it is worth. The magenta
              ones are being forgotten right now.
            </p>
          )}
        </div>
      </div>

      {/* ---------------- Radar ---------------- */}
      <div className="stage flex justify-center">
        {/* The label layer is a sibling of the spinning stage, not a child.
            Counter-rotating labels inside it only undoes the X tilt -- the
            Z spin still carries them round, so they end up mirrored and
            upside down at half the rotation. Keeping them out of the
            transformed subtree entirely is the only version that stays
            readable. */}
        <div className="relative">
        <div
          ref={spinRef}
          className="stage-3d relative"
          style={{
            animation: reduced ? undefined : "radar-spin 26s linear infinite",
            // The keyframes carry rotateX themselves; this is the static
            // fallback for reduced motion, where no animation runs.
            transform: "rotateX(58deg)",
          }}
        >
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-[min(82vw,480px)] w-[min(82vw,480px)]"
            role="img"
            aria-label="Radar of Algebra II sub-skill mastery. Radicals and Complex numbers are decaying."
          >
            <defs>
              <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2bd9ff" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#b4ff39" stopOpacity="0.1" />
              </radialGradient>
            </defs>

            {/* Rings */}
            {[0.25, 0.5, 0.75, 1].map((r) => (
              <circle
                key={r}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS * r}
                fill="none"
                stroke="rgb(255 255 255 / 0.09)"
                strokeWidth="1"
              />
            ))}

            {/* Spokes */}
            {AXES.map((_, i) => {
              const edge = pointAt(i, 100, AXES.length);
              return (
                <line
                  key={i}
                  x1={CENTER}
                  y1={CENTER}
                  x2={edge.x}
                  y2={edge.y}
                  stroke="rgb(255 255 255 / 0.08)"
                  strokeWidth="1"
                />
              );
            })}

            {/* Recovered potential, drawn behind as a dashed ghost */}
            <polygon
              points={recoveredShape.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="rgb(180 255 57 / 0.35)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />

            {/* Current mastery */}
            <polygon
              points={shape.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="url(#radar-fill)"
              stroke="#2bd9ff"
              strokeWidth="1.6"
              style={{ filter: "drop-shadow(0 0 8px rgb(43 217 255 / 0.7))" }}
            />

            {/* Vertices */}
            {AXES.map((axis, i) => {
              const p = shape[i];
              const isHot = hovered === i;
              return (
                <g
                  key={axis.label}
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
                  style={{ cursor: "pointer" }}
                >
                  {/* Generous invisible hit area: an 4px dot is not a
                      pointer target, especially on a rotating stage. */}
                  <circle cx={p.x} cy={p.y} r="18" fill="transparent" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHot ? 7 : 4.5}
                    fill={axis.decaying ? "#ff3d6e" : "#b4ff39"}
                    className={axis.decaying && !isHot ? "decaying" : ""}
                    style={{
                      filter: `drop-shadow(0 0 ${isHot ? 14 : 7}px ${
                        axis.decaying ? "rgb(255 61 110 / 0.9)" : "rgb(180 255 57 / 0.9)"
                      })`,
                      transition: "r 200ms var(--ease-premium-out)",
                    }}
                  />
                </g>
              );
            })}
          </svg>

        </div>

          {/* Static, upright labels over the top. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {AXES.map((axis, i) => {
              const p = pointAt(i, 122, AXES.length);
              // The radar is tilted 58 degrees, which compresses it
              // vertically to cos(58) of its width. The labels are not
              // tilted, so their vertical offset has to be squashed by the
              // same factor or they float far above and below the shape
              // they are supposed to be naming.
              const y = CENTER + (p.y - CENTER) * TILT_SQUASH;
              return (
                <span
                  key={axis.label}
                  className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors duration-200"
                  style={{
                    left: `${(p.x / SIZE) * 100}%`,
                    top: `${(y / SIZE) * 100}%`,
                    color:
                      hovered === i
                        ? "var(--text-1)"
                        : axis.decaying
                          ? "#ff9ab5"
                          : "var(--text-3)",
                    textShadow: "0 0 10px rgb(5 5 6 / 0.9)",
                  }}
                >
                  {axis.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
