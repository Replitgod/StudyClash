"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeMotion } from "@/lib/motionEngine";

// "Ingest to Repair", as a scroll-locked camera move.
//
// The section pins and scroll drives a virtual camera flying through four
// stacked rack panels on the Z axis. Each panel phases in with a glitch
// title, a fill bar and telemetry counters that count toward their value as
// the panel arrives.
//
// The accessibility problem with scroll-jacking is real, so the same rule
// applies as everywhere else on this page: the locked treatment is
// desktop-and-motion-only. On a phone, or with reduced motion, the four
// panels are an ordinary vertical list. Nothing becomes unreachable and
// nothing depends on a scroll position to be readable.

const STEPS = [
  {
    n: "01",
    title: "INGEST",
    body: "Drop a topic, your notes, a PDF, or a photo of the page. It parses all of it and extracts every concept worth knowing.",
    channels: [
      { label: "PARSE", value: 100, unit: "%" },
      { label: "TO FIRST Q", value: 20, unit: "s" },
    ],
  },
  {
    n: "02",
    title: "GENERATE",
    body: "Notes, questions and flashcards written from your material — every answer validated before it can reach you.",
    channels: [
      { label: "VERIFIED", value: 100, unit: "%" },
      { label: "REJECTED", value: 7, unit: "%" },
    ],
  },
  {
    n: "03",
    title: "DETECT",
    body: "Each answer updates a real mastery model: recency, difficulty, hesitation, decay. It separates learned from lucky.",
    channels: [
      { label: "SIGNALS", value: 6, unit: "" },
      { label: "CONFIDENCE", value: 94, unit: "%" },
    ],
  },
  {
    n: "04",
    title: "REPAIR",
    body: "Miss something and it names the exact misconception, then re-tests the same idea from a different angle until it holds.",
    channels: [
      { label: "RECOVERY XP", value: 30, unit: "" },
      { label: "RETENTION", value: 87, unit: "%" },
    ],
  },
];

/** Counts up to `value` while `active`, and resets when it leaves. */
function Counter({ value, active, unit }: { value: number; active: boolean; unit: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!active) {
      setShown(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const run = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo: fast then settles, which is how a real readout locks on.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [active, value]);

  return (
    <span className="font-mono tabular-nums">
      {value % 1 === 0 ? Math.round(shown) : shown.toFixed(1)}
      {unit}
    </span>
  );
}

export function ServerRack() {
  const wrapRef = useRef<HTMLElement | null>(null);
  const [locked, setLocked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [energy, setEnergy] = useState(0);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setLocked(wide.matches && !reduce.matches);
    update();
    wide.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!locked) {
      setProgress(0);
      return;
    }
    return subscribeMotion((m) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const p = scrollable <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / scrollable));
      setProgress(p);
      setEnergy(Math.min(1, m.scrollVelocity));
    });
  }, [locked]);

  // Which panel the camera is currently at, as a float.
  const cursor = progress * (STEPS.length - 1);

  return (
    <section
      ref={wrapRef}
      aria-labelledby="rack"
      className="relative"
      style={locked ? { height: `${STEPS.length * 100}vh` } : undefined}
    >
      <div
        className={
          locked
            ? "sticky top-0 flex h-dvh flex-col justify-center overflow-hidden"
            : "py-24 sm:py-32"
        }
      >
        {/* Rack rails */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="tech-grid absolute inset-0 opacity-30" />
          <div
            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
            style={{
              background:
                "linear-gradient(180deg, transparent, rgb(0 200 255 / 0.28), transparent)",
            }}
          />
        </div>

        <div className="relative mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="flex items-baseline justify-between gap-4">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.26em]"
              style={{ color: "var(--neon-blue)" }}
            >
              Ingest → Repair
            </p>
            {locked && (
              <span
                className="font-mono text-[11px] tabular-nums"
                style={{ color: "var(--neon-green)" }}
              >
                {String(Math.min(STEPS.length, Math.floor(cursor) + 1)).padStart(2, "0")}/
                {String(STEPS.length).padStart(2, "0")}
              </span>
            )}
          </div>

          <h2 id="rack" className="sr-only">
            How AceDecks works, in four steps
          </h2>

          {/* ---- Locked: the camera flight ---- */}
          {locked ? (
            <div
              className="relative mt-8 h-[62vh]"
              style={{ perspective: "1200px", perspectiveOrigin: "50% 50%" }}
            >
              {STEPS.map((step, index) => {
                // Distance from the camera, in panels.
                const offset = index - cursor;
                const isActive = Math.abs(offset) < 0.5;
                // Panels behind the camera fly past; ahead they recede.
                const z = -offset * 760;
                // Falls to zero just before the next panel arrives, so two
                // titles never overlap and read as one muddy word.
                const opacity = Math.max(0, 1 - Math.abs(offset) * 1.25);
                const blur = Math.min(12, Math.abs(offset) * 8);

                return (
                  <article
                    key={step.n}
                    aria-hidden={!isActive}
                    className="scanlines absolute inset-0 rounded-[var(--radius-lg)] p-8 sm:p-10"
                    style={{
                      transform: `translate3d(0, 0, ${z}px) scale(${1 + offset * 0.02})`,
                      opacity,
                      filter: `blur(${blur}px)`,
                      pointerEvents: isActive ? "auto" : "none",
                      background:
                        "linear-gradient(160deg, rgb(9 11 14 / 0.96), rgb(0 0 0 / 0.99))",
                      border: `1px solid ${
                        isActive ? "rgb(0 255 102 / 0.4)" : "rgb(255 255 255 / 0.08)"
                      }`,
                      boxShadow: isActive
                        ? "0 0 90px -26px rgb(0 255 102 / 0.55)"
                        : "none",
                      willChange: "transform, opacity, filter",
                    }}
                  >
                    <PanelBody step={step} active={isActive} energy={energy} />
                  </article>
                );
              })}
            </div>
          ) : (
            /* ---- Unlocked: a plain, complete list ---- */
            <div className="mt-10 grid gap-6">
              {STEPS.map((step) => (
                <article
                  key={step.n}
                  className="scanlines relative rounded-[var(--radius-lg)] p-7 sm:p-9"
                  style={{
                    background:
                      "linear-gradient(160deg, rgb(9 11 14 / 0.96), rgb(0 0 0 / 0.99))",
                    border: "1px solid rgb(255 255 255 / 0.09)",
                  }}
                >
                  <PanelBody step={step} active energy={0} />
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PanelBody({
  step,
  active,
  energy,
}: {
  step: (typeof STEPS)[number];
  active: boolean;
  energy: number;
}) {
  return (
    <div className="relative flex h-full flex-col justify-center">
      <div className="flex items-start justify-between gap-6">
        <span
          className="brutal text-[clamp(3rem,9vw,7rem)] leading-none"
          style={{
            color: "transparent",
            WebkitTextStroke: `1.5px ${
              active ? "rgb(0 255 102 / 0.75)" : "rgb(255 255 255 / 0.2)"
            }`,
            ["--wdth" as string]: 88,
          }}
        >
          {step.n}
        </span>

        <div className="flex gap-6 text-right">
          {step.channels.map((channel) => (
            <div key={channel.label}>
              <div
                className="text-[clamp(1.1rem,2vw,1.7rem)] leading-none"
                style={{ color: "var(--neon-blue)" }}
              >
                <Counter value={channel.value} active={active} unit={channel.unit} />
              </div>
              <div
                className="mt-1.5 text-[9px] uppercase tracking-[0.14em]"
                style={{ color: "var(--text-4)" }}
              >
                {channel.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h3
        className="brutal glitch mt-6 text-[clamp(2.2rem,6vw,4.6rem)]"
        data-text={step.title}
        style={{ color: "var(--text-1)", ["--wdth" as string]: 94 - energy * 12 }}
      >
        {step.title}
      </h3>

      <p
        className="mt-4 max-w-xl text-[15.5px] leading-relaxed"
        style={{ color: "var(--text-2)" }}
      >
        {step.body}
      </p>

      {/* Mechanical fill bar */}
      <div className="mt-8 flex items-center gap-3">
        <div
          className="relative h-2 flex-1 overflow-hidden rounded-full"
          style={{ background: "rgb(255 255 255 / 0.07)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
            style={{
              width: active ? "100%" : "0%",
              background: "linear-gradient(90deg, var(--neon-blue), var(--neon-green))",
              boxShadow: "0 0 16px rgb(0 255 102 / 0.65)",
            }}
          />
        </div>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.12em]"
          style={{ color: active ? "var(--neon-green)" : "var(--text-4)" }}
        >
          {active ? "ONLINE" : "STANDBY"}
        </span>
      </div>
    </div>
  );
}
