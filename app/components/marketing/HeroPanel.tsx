"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Clock, Flame, TrendingDown } from "lucide-react";

// The hero's product anchor.
//
// A condensed version of the decision the app actually makes when you open
// it: this topic, this reason, this long. It exists because the page's two
// interactive pieces sit far enough down that a first-time visitor may
// never reach them -- and a landing page whose proof is below the fold is a
// landing page arguing on trust alone.
//
// Deliberately not a screenshot. The bars fill on mount and the decaying
// row pulses, so it reads as a live surface rather than a marketing image,
// and it stays legible when motion is off.

type Row = {
  topic: string;
  mastery: number;
  state: "decaying" | "due" | "holding";
};

const ROWS: Row[] = [
  { topic: "Le Châtelier's principle", mastery: 38, state: "decaying" },
  { topic: "Reaction quotient Q", mastery: 54, state: "due" },
  { topic: "Equilibrium constants", mastery: 82, state: "holding" },
  { topic: "Acid–base titration", mastery: 91, state: "holding" },
];

const TONE: Record<Row["state"], { bar: string; label: string; text: string }> = {
  decaying: { bar: "var(--accent)", label: "Decaying", text: "var(--accent-bright)" },
  due: { bar: "#ffb020", label: "Due now", text: "#ffc861" },
  holding: { bar: "#34e39b", label: "Holding", text: "#7fe9be" },
};

export function HeroPanel() {
  // Bars start at zero and fill once mounted, so the panel animates in even
  // though the values themselves are static.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setFilled(true), 260);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="relative w-full max-w-[440px]"
      // Pulled up slightly on large screens so it optically centres against
      // the headline rather than the whole column.
      style={{ transform: "translateZ(0)" }}
    >
      {/* Glow behind the panel */}
      <div
        aria-hidden="true"
        className="absolute -inset-8 rounded-[32px]"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 30%, rgb(255 0 122 / 0.18), transparent 70%)",
          filter: "blur(28px)",
        }}
      />

      <div
        className="relative overflow-hidden rounded-[18px] p-5 sm:p-6"
        style={{
          border: "1px solid rgb(255 255 255 / 0.1)",
          background:
            "linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.018))",
          backdropFilter: "blur(20px)",
          boxShadow:
            "0 30px 80px -40px rgb(0 0 0 / 1), inset 0 1px 0 0 rgb(255 255 255 / 0.07)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }}
            />
            <span
              className="text-[10.5px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--text-3)" }}
            >
              Do this next
            </span>
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-[11px]"
            style={{ color: "var(--text-4)" }}
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            ~7 min
          </span>
        </div>

        {/* The decision */}
        <p
          className="mt-4 text-[20px] font-semibold tracking-[-0.02em]"
          style={{ color: "var(--text-1)" }}
        >
          Chemistry · Equilibrium
        </p>
        <p
          className="mt-1.5 inline-flex items-center gap-1.5 text-[13px]"
          style={{ color: "var(--accent-bright)" }}
        >
          <TrendingDown className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
          2 concepts slipping since Tuesday
        </p>

        {/* Mastery rows */}
        <ul className="mt-5 flex flex-col gap-3">
          {ROWS.map((row, index) => {
            const tone = TONE[row.state];
            return (
              <li key={row.topic}>
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className="truncate text-[13px]"
                    style={{ color: "var(--text-2)" }}
                  >
                    {row.topic}
                  </span>
                  <span
                    className="flex-none text-[11px] font-medium tabular-nums"
                    style={{ color: tone.text }}
                  >
                    {row.mastery}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full"
                  style={{ background: "rgb(255 255 255 / 0.06)" }}
                  role="progressbar"
                  aria-valuenow={row.mastery}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${row.topic}: ${row.mastery} percent, ${tone.label}`}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: filled ? `${row.mastery}%` : "0%",
                      background: tone.bar,
                      boxShadow: `0 0 12px ${tone.bar}`,
                      transition: `width 1100ms cubic-bezier(0.16,1,0.3,1) ${index * 90 + 120}ms`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer action */}
        <div
          className="mt-6 flex items-center justify-between gap-3 border-t pt-4"
          style={{ borderColor: "rgb(255 255 255 / 0.07)" }}
        >
          <span
            className="inline-flex items-center gap-1.5 text-[12px]"
            style={{ color: "var(--text-4)" }}
          >
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            12-day streak
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--accent-line)",
              color: "var(--accent-bright)",
            }}
          >
            Start training
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}
