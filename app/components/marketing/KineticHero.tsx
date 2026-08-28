"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { MagneticButton } from "@/app/components/motion/MagneticButton";

// The hero.
//
// It is one tall sticky stage with two states driven by a single scroll
// progress value: kinetic type at 0, a live "brain map" at 1. Crucially the
// two are cross-faded on the *same* pinned canvas rather than stacked as
// two sections, so the headline appears to resolve into the dashboard
// instead of scrolling away above it.
//
// The scroll driver is a plain rAF-throttled read of getBoundingClientRect,
// not a scroll listener doing layout work per event. Everything it writes
// is transform/opacity/filter or a CSS variable, so no frame triggers
// layout.
//
// Under prefers-reduced-motion the whole thing collapses to the end state:
// the dashboard, legible and static. The headline still reads, nothing
// moves, and no information is lost.

const LOOP_WORDS = ["STOP DECIDING", "START KNOWING", "STOP GUESSING", "START ACING"];

/** Nodes of the knowledge map. Positions are percentages of the stage. */
const NODES = [
  { id: "eq", label: "Equilibrium", x: 26, y: 30, mastery: 41, decaying: true },
  { id: "st", label: "Stoichiometry", x: 52, y: 18, mastery: 88, decaying: false },
  { id: "th", label: "Thermo", x: 74, y: 34, mastery: 72, decaying: false },
  { id: "ki", label: "Kinetics", x: 38, y: 58, mastery: 55, decaying: true },
  { id: "ac", label: "Acids & Bases", x: 66, y: 68, mastery: 93, decaying: false },
  { id: "re", label: "Redox", x: 16, y: 62, mastery: 64, decaying: false },
];

const EDGES: Array<[string, string]> = [
  ["eq", "st"],
  ["eq", "ki"],
  ["st", "th"],
  ["th", "ac"],
  ["ki", "ac"],
  ["re", "ki"],
  ["re", "eq"],
];

function nodeById(id: string) {
  return NODES.find((n) => n.id === id)!;
}

export function KineticHero() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const typeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Reduced motion: show the resolved state and never animate.
    if (reduced) {
      if (typeRef.current) typeRef.current.style.opacity = "0";
      if (mapRef.current) {
        mapRef.current.style.opacity = "1";
        mapRef.current.style.transform = "none";
      }
      return;
    }

    let frame = 0;
    let queued = false;

    const render = () => {
      queued = false;
      const rect = wrap.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      // 0 while the section is entering, 1 once it has been scrolled past.
      const progress =
        scrollable <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / scrollable));

      // Type: shrinks, compresses on the width axis, blurs out and lifts.
      if (typeRef.current) {
        const out = Math.min(1, progress / 0.55);
        typeRef.current.style.opacity = String(1 - out);
        typeRef.current.style.transform = `translate3d(0, ${-out * 14}vh, 0) scale(${1 - out * 0.22})`;
        typeRef.current.style.filter = `blur(${out * 14}px)`;
        // The warp: 125 wide at rest, squeezed to 78 as it dissolves.
        typeRef.current.style.setProperty("--wdth", String(125 - out * 47));
      }

      // Map: rises and resolves as the type leaves.
      if (mapRef.current) {
        const inn = Math.min(1, Math.max(0, (progress - 0.32) / 0.5));
        mapRef.current.style.opacity = String(inn);
        mapRef.current.style.transform = `translate3d(0, ${(1 - inn) * 12}vh, 0) scale(${0.9 + inn * 0.1}) rotateX(${(1 - inn) * 12}deg)`;
      }
    };

    const onScroll = () => {
      // Coalesce to one write per frame. A raw scroll handler can fire far
      // more often than the display refreshes, and every extra call here is
      // a wasted layout read.
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(render);
    };

    render();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div ref={wrapRef} className="relative h-[240vh]">
      <div className="sticky top-0 h-dvh overflow-hidden">
        {/* Ambient field */}
        <div className="absolute inset-0" aria-hidden="true">
          <div className="tech-grid absolute inset-0 opacity-60" />
          <div
            className="absolute left-1/2 top-1/2 h-[70vw] w-[70vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgb(43 217 255 / 0.14) 0%, transparent 62%)",
              filter: "blur(60px)",
            }}
          />
          <div
            className="absolute bottom-[-20%] left-[10%] h-[46vw] w-[46vw] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgb(180 255 57 / 0.13) 0%, transparent 64%)",
              filter: "blur(70px)",
            }}
          />
        </div>

        {/* ---------------- Kinetic type ---------------- */}
        <div
          ref={typeRef}
          className="absolute inset-0 z-10 flex flex-col justify-center will-change-transform"
        >
          <div className="pointer-events-none select-none" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex overflow-hidden py-1">
                <div
                  className={`kinetic-track ${row === 1 ? "kinetic-track-reverse" : ""}`}
                  style={{ animationDuration: `${20 + row * 7}s` }}
                >
                  {[0, 1].map((copy) => (
                    <span key={copy} className="flex">
                      {LOOP_WORDS.map((word, i) => (
                        <span
                          key={`${copy}-${word}`}
                          className="brutal px-5 text-[clamp(3rem,11vw,9rem)]"
                          style={{
                            color:
                              row === 1
                                ? "transparent"
                                : i % 2 === 0
                                  ? "var(--text-1)"
                                  : "var(--neon-blue)",
                            WebkitTextStroke:
                              row === 1 ? "1.5px rgb(180 255 57 / 0.55)" : undefined,
                            opacity: row === 0 ? 1 : row === 1 ? 0.85 : 0.32,
                          }}
                        >
                          {word}
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* The actual, accessible headline */}
          <div className="relative mx-auto mt-10 w-full max-w-6xl px-5 sm:px-8">
            {/* The visible headline is the kinetic loop above, which is a
                decorative marquee of four phrases and is aria-hidden. The
                page still needs one real h1 carrying the actual promise --
                for screen readers, for search, and because a page whose
                only heading is decoration has no heading at all. */}
            <h1 className="sr-only">Stop deciding what to study.</h1>
            <p
              className="max-w-xl text-[15px] leading-relaxed sm:text-[17px]"
              style={{ color: "var(--text-2)" }}
            >
              AceDecks reads your notes, finds the concepts you are quietly
              losing, and drills them back before an exam finds them first.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <MagneticButton
                href="/signup"
                className="btn btn-lg box-glow-green"
                ariaLabel="Start studying free"
              >
                <span
                  className="font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "var(--neon-green)" }}
                >
                  Start studying free
                </span>
              </MagneticButton>
              <Link
                href="/login"
                className="btn btn-lg"
                style={{
                  border: "1px solid rgb(255 255 255 / 0.16)",
                  color: "var(--text-1)",
                }}
              >
                I have an account
              </Link>
            </div>
          </div>
        </div>

        {/* ---------------- Brain map ---------------- */}
        <div
          ref={mapRef}
          className="stage absolute inset-0 z-20 flex items-center justify-center opacity-0 will-change-transform"
        >
          <div className="stage-3d relative mx-auto aspect-[16/10] w-[min(92vw,1050px)]">
            <div
              className="scanlines absolute inset-0 overflow-hidden rounded-[var(--radius-lg)]"
              style={{
                border: "1px solid rgb(43 217 255 / 0.22)",
                background:
                  "linear-gradient(160deg, rgb(11 13 16 / 0.94), rgb(5 5 6 / 0.97))",
                boxShadow: "0 0 90px -30px rgb(43 217 255 / 0.5)",
              }}
            >
              <div className="tech-grid absolute inset-0 opacity-40" />

              {/* Edges */}
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {EDGES.map(([a, b]) => {
                  const from = nodeById(a);
                  const to = nodeById(b);
                  const weak = from.decaying || to.decaying;
                  return (
                    <line
                      key={`${a}-${b}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={weak ? "rgb(255 61 110 / 0.4)" : "rgb(43 217 255 / 0.35)"}
                      strokeWidth="0.22"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </svg>

              {/* Nodes */}
              {NODES.map((node) => (
                <div
                  key={node.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
                      node.decaying ? "decaying" : ""
                    }`}
                    style={{
                      border: `1px solid ${
                        node.decaying
                          ? "rgb(255 61 110 / 0.5)"
                          : "rgb(180 255 57 / 0.4)"
                      }`,
                      background: node.decaying
                        ? "rgb(255 61 110 / 0.1)"
                        : "rgb(180 255 57 / 0.08)",
                      boxShadow: node.decaying
                        ? "0 0 22px -6px rgb(255 61 110 / 0.7)"
                        : "0 0 22px -6px rgb(180 255 57 / 0.6)",
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: node.decaying
                          ? "var(--neon-decay)"
                          : "var(--neon-green)",
                      }}
                    />
                    <span
                      className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] sm:text-[11px]"
                      style={{
                        color: node.decaying ? "#ffb3c6" : "#dcffa6",
                      }}
                    >
                      {node.label}
                    </span>
                    <span
                      className="text-[10px] tabular-nums sm:text-[11px]"
                      style={{ color: "var(--text-3)" }}
                    >
                      {node.mastery}
                    </span>
                  </div>
                </div>
              ))}

              {/* Telemetry strip */}
              <div
                className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6"
                style={{
                  borderColor: "rgb(255 255 255 / 0.08)",
                  background: "rgb(0 0 0 / 0.4)",
                }}
              >
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--neon-blue)" }}
                >
                  Live knowledge map
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  2 concepts decaying · next review in 3h
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
