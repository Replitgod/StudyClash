"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

// The four-step loop, as a horizontal scroll.
//
// The section is pinned while vertical scroll is translated into horizontal
// movement. That is the effect asked for, and it has one well-known failure
// mode: on a phone, or with reduced motion, or with a keyboard, a pinned
// horizontal rail is a trap -- content you cannot reach and cannot tab
// through.
//
// So the horizontal treatment is desktop-and-motion-only. Everywhere else
// the exact same markup renders as an ordinary vertical stack. Nothing is
// hidden, nothing is unreachable, and the telemetry styling survives.

const STEPS = [
  {
    n: "01",
    title: "Ingest",
    body: "Drop a topic, your notes, a PDF, or a photo of the page. It parses all of it and extracts the concepts worth knowing.",
    metric: "~20s",
    metricLabel: "to first question",
    channel: 92,
  },
  {
    n: "02",
    title: "Generate",
    body: "Notes, questions and flashcards written from your material — validated so a question can never ship without a defensible answer.",
    metric: "100%",
    metricLabel: "answers verified",
    channel: 78,
  },
  {
    n: "03",
    title: "Detect",
    body: "Every answer updates a real mastery model: recency, difficulty, hesitation, decay. It knows the difference between learned and lucky.",
    metric: "6",
    metricLabel: "signals tracked",
    channel: 64,
  },
  {
    n: "04",
    title: "Repair",
    body: "Miss something and it names the exact misconception, then asks a different question on the same idea until it sticks.",
    metric: "+30",
    metricLabel: "XP per recovery",
    channel: 88,
  },
];

export function TelemetrySteps() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [horizontal, setHorizontal] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const update = () => setHorizontal(wide.matches && !reduced);
    update();
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, [reduced]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !horizontal) {
      setProgress(0);
      if (railRef.current) railRef.current.style.transform = "none";
      return;
    }

    let frame = 0;
    let queued = false;

    const render = () => {
      queued = false;
      const rect = wrap.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const p = scrollable <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / scrollable));
      setProgress(p);

      const rail = railRef.current;
      if (rail) {
        // Travel is the rail's real overflow, measured rather than assumed,
        // so the last card always lands flush with the right edge whatever
        // the viewport width.
        const travel = Math.max(0, rail.scrollWidth - window.innerWidth);
        rail.style.transform = `translate3d(${-p * travel}px, 0, 0)`;
      }
    };

    const onScroll = () => {
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
  }, [horizontal]);

  const activeIndex = Math.min(
    STEPS.length - 1,
    Math.floor(progress * STEPS.length + 0.0001)
  );

  return (
    <section
      aria-labelledby="loop"
      ref={wrapRef}
      // The tall wrapper is what gives the pinned rail something to scroll
      // through. Without horizontal mode it collapses to auto height.
      style={horizontal ? { height: `${STEPS.length * 85}vh` } : undefined}
      className="relative"
    >
      <div
        className={
          horizontal
            ? "sticky top-0 flex h-dvh flex-col justify-center overflow-hidden"
            : "py-24 sm:py-32"
        }
      >
        {/* Header + telemetry bar */}
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.24em]"
            style={{ color: "var(--neon-blue)" }}
          >
            The loop
          </p>
          <h2
            id="loop"
            className={`brutal mt-4 ${
              horizontal
                ? "text-[clamp(2rem,4vw,3.4rem)]"
                : "text-[clamp(2.4rem,6.5vw,5.2rem)]"
            }`}
            style={{ color: "var(--text-1)", ["--wdth" as string]: 92 }}
          >
            Four steps.<br />
            <span className="neon-green glow-green">You pick none.</span>
          </h2>

          {/* F1-style channel readout */}
          <div className={`${horizontal ? "mt-5" : "mt-8"} flex items-center gap-3`}>
            <div
              className="relative h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: "rgb(255 255 255 / 0.08)" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
                style={{
                  width: `${horizontal ? progress * 100 : 100}%`,
                  background: "linear-gradient(90deg, var(--neon-blue), var(--neon-green))",
                  boxShadow: "0 0 14px rgb(180 255 57 / 0.6)",
                }}
              />
            </div>
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: "var(--neon-green)" }}
            >
              {String(activeIndex + 1).padStart(2, "0")}/{String(STEPS.length).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Rail */}
        <div className={horizontal ? "mt-8 overflow-hidden" : "mt-12"}>
          <div
            ref={railRef}
            className={
              horizontal
                ? "flex gap-6 pl-[max(1.25rem,calc((100vw-72rem)/2+2rem))] pr-8 will-change-transform"
                : "mx-auto grid max-w-6xl gap-6 px-5 sm:grid-cols-2 sm:px-8"
            }
          >
            {STEPS.map((step, index) => {
              const isActive = horizontal && index === activeIndex;
              return (
                <article
                  key={step.n}
                  data-cursor={step.title}
                  className={`scanlines relative overflow-hidden rounded-[var(--radius-lg)] transition-all duration-500 ${
                    horizontal
                      ? "w-[min(78vw,410px)] flex-none p-6"
                      : "p-7 sm:p-9"
                  }`}
                  style={{
                    background:
                      "linear-gradient(160deg, rgb(11 13 16 / 0.95), rgb(5 5 6 / 0.98))",
                    border: `1px solid ${
                      isActive ? "rgb(180 255 57 / 0.45)" : "rgb(255 255 255 / 0.09)"
                    }`,
                    boxShadow: isActive
                      ? "0 0 60px -20px rgb(180 255 57 / 0.6)"
                      : "none",
                    transform: horizontal
                      ? `scale(${isActive ? 1 : 0.955})`
                      : undefined,
                  }}
                >
                  <div className="tech-grid absolute inset-0 opacity-30" aria-hidden="true" />

                  <div className="relative">
                    <div className="flex items-baseline justify-between gap-4">
                      <span
                        className={`brutal leading-none ${
                          horizontal ? "text-[2.6rem]" : "text-[3.4rem]"
                        }`}
                        style={{
                          color: "transparent",
                          WebkitTextStroke: `1.5px ${
                            isActive ? "var(--neon-green)" : "rgb(255 255 255 / 0.22)"
                          }`,
                        }}
                      >
                        {step.n}
                      </span>
                      <div className="text-right">
                        <div
                          className="font-mono text-[20px] tabular-nums leading-none"
                          style={{ color: "var(--neon-blue)" }}
                        >
                          {step.metric}
                        </div>
                        <div
                          className="mt-1 text-[10px] uppercase tracking-[0.12em]"
                          style={{ color: "var(--text-3)" }}
                        >
                          {step.metricLabel}
                        </div>
                      </div>
                    </div>

                    <h3
                      className={`brutal ${horizontal ? "mt-4 text-[1.6rem]" : "mt-6 text-[1.9rem]"}`}
                      style={{ color: "var(--text-1)", ["--wdth" as string]: 100 }}
                    >
                      {step.title}
                    </h3>
                    <p
                      className="mt-3 text-[15px] leading-relaxed"
                      style={{ color: "var(--text-2)" }}
                    >
                      {step.body}
                    </p>

                    {/* Channel trace */}
                    <div className={`${horizontal ? "mt-5" : "mt-7"} flex items-center gap-2`}>
                      {Array.from({ length: 28 }).map((_, i) => {
                        const on = (i / 28) * 100 < step.channel;
                        return (
                          <span
                            key={i}
                            className="h-5 flex-1 rounded-[1px]"
                            style={{
                              background: on
                                ? i > 22
                                  ? "var(--neon-decay)"
                                  : "var(--neon-green)"
                                : "rgb(255 255 255 / 0.07)",
                              opacity: on ? 0.35 + (i / 28) * 0.65 : 1,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
