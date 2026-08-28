"use client";

import { useCallback } from "react";
import { FileInput, Sparkles, Radar, Wrench, type LucideIcon } from "lucide-react";

// The four-step grid.
//
// Every card is the same component in the same grid track, so heights are
// equal by construction rather than by a magic min-height that breaks the
// moment one body copy runs a line longer. `.bento` is `height: 100%` with
// a column flex, and the footer row is pushed down with `mt-auto` — that is
// what keeps the stat rows aligned across all four cards regardless of how
// much text sits above them.
//
// The shimmer follows the cursor: pointermove writes --mx/--my on the card,
// and the CSS radial gradient in `.bento::before` reads them. Doing it in
// CSS rather than React keeps it off the render path entirely.

type Step = {
  n: string;
  title: string;
  Icon: LucideIcon;
  badge: string;
  body: string;
  stats: Array<{ value: string; label: string }>;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Ingest",
    Icon: FileInput,
    badge: "Anything you have",
    body: "Drop a topic, your notes, a PDF, or a photo of the page. Everything gets parsed into concepts.",
    stats: [
      { value: "Any", label: "file type" },
      { value: "~20s", label: "to first question" },
    ],
  },
  {
    n: "02",
    title: "Generate",
    Icon: Sparkles,
    badge: "Written from your material",
    body: "Notes, questions and flashcards written from your material — every answer validated before it reaches you.",
    stats: [
      { value: "100%", label: "answers verified" },
      { value: "0", label: "broken questions" },
    ],
  },
  {
    n: "03",
    title: "Detect",
    Icon: Radar,
    badge: "The mastery model",
    body: "Each answer updates a real mastery model: recency, difficulty, hesitation and decay.",
    stats: [
      { value: "6", label: "signals tracked" },
      { value: "Live", label: "decay modelling" },
    ],
  },
  {
    n: "04",
    title: "Repair",
    Icon: Wrench,
    badge: "Where the gain is",
    body: "Miss something and it names the exact misconception, then re-tests the same idea until it holds.",
    stats: [
      { value: "+30", label: "recovery XP" },
      { value: "1 tap", label: "to fix a gap" },
    ],
  },
];

export function StepGrid() {
  const track = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step) => (
        <article key={step.n} className="bento p-6" onPointerMove={track}>
          <div className="flex items-start justify-between gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
              style={{
                border: "1px solid var(--accent-line)",
                background: "var(--accent-soft)",
              }}
            >
              <step.Icon className="h-4 w-4" style={{ color: "var(--accent-bright)" }} />
            </span>
            <span
              className="font-mono text-[11px] tabular-nums tracking-[0.18em]"
              style={{ color: "var(--text-4)" }}
            >
              {step.n}
            </span>
          </div>

          <p
            className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--accent-bright)" }}
          >
            {step.badge}
          </p>

          <h3
            className="mt-2 text-[19px] font-semibold tracking-[-0.02em]"
            style={{ color: "var(--text-1)" }}
          >
            {step.title}
          </h3>

          <p
            className="mt-2.5 text-[14.5px] leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            {step.body}
          </p>

          {/* mt-auto is what locks the stat rows to the same baseline across
              all four cards, whatever the body copy above does. */}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
            {step.stats.map((stat) => (
              <div key={stat.label} className="stat-pill flex-col items-start gap-0.5">
                <span
                  className="text-[15px] font-semibold leading-none"
                  style={{ color: "var(--text-1)" }}
                >
                  {stat.value}
                </span>
                <span
                  className="text-[10.5px] leading-tight"
                  style={{ color: "var(--text-3)" }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
