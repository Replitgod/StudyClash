"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  FileText,
  Layers,
  ListChecks,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

// The homepage product demo.
//
// The page used to describe what happens when you give AceDecks your notes.
// This shows it: a file lands, the app reads it, and the four things it built
// come out the other side as real UI rather than an illustration of UI.
//
// Everything here is genuine product surface -- the study guide, the card with
// its four confidence buttons, the practice question with the misconception
// feedback, the mastery bars -- so a visitor who clicks through has already
// seen the thing they are signing up for.
//
// Three constraints shaped the implementation:
//
//   It must not run before it is seen. The sequence starts on intersection,
//   not on mount, or it plays to an empty viewport and a visitor who scrolls
//   down finds it already finished.
//
//   It must not trap the reader in an animation. Every phase is skippable by
//   clicking a tab, and under prefers-reduced-motion it starts finished.
//
//   It must not shift the page. The panel holds one height across all four
//   tabs, because a demo that resizes as you click it is worse than a static
//   screenshot.

type TabId = "guide" | "cards" | "practice" | "progress";

const TABS: Array<{ id: TabId; label: string; Icon: LucideIcon }> = [
  { id: "guide", label: "Study guide", Icon: BookOpen },
  { id: "cards", label: "Flashcards", Icon: Layers },
  { id: "practice", label: "Practice", Icon: ListChecks },
  { id: "progress", label: "Progress", Icon: TrendingUp },
];

// What the app reports while it works. Real stage names, not a spinner.
const STAGES = [
  "Reading 14 pages",
  "Found 23 concepts",
  "Writing your questions",
  "Building your study guide",
];

type Phase = "idle" | "reading" | "ready";

/* ------------------------------------------------------------------ panels */

function GuidePanel() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p
          className="text-[15px] font-semibold"
          style={{ color: "var(--text-1)" }}
        >
          Le Châtelier&rsquo;s principle
        </p>
        <p
          className="mt-1.5 text-[13.5px] leading-relaxed"
          style={{ color: "var(--text-2)" }}
        >
          Disturb a system at equilibrium and it shifts to partly undo the
          change. Add reactant, it shifts right. Remove heat from an exothermic
          reaction, it shifts right.
        </p>
      </div>

      <div
        className="rounded-[10px] border p-3"
        style={{
          borderColor: "rgb(255 176 32 / 0.26)",
          background: "rgb(255 176 32 / 0.07)",
        }}
      >
        <p
          className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "var(--warn)" }}
        >
          You must know this
        </p>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--text-2)" }}
        >
          A catalyst speeds both directions equally, so it never shifts the
          position of equilibrium. This is the most commonly missed mark.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {[
          ["Add pressure", "Shifts to fewer moles of gas"],
          ["Raise temperature", "Shifts endothermic direction"],
        ].map(([term, meaning]) => (
          <div
            key={term}
            className="rounded-[10px] border px-3 py-2.5"
            style={{
              borderColor: "rgb(255 255 255 / 0.08)",
              background: "rgb(255 255 255 / 0.025)",
            }}
          >
            <dt
              className="text-[12px] font-medium"
              style={{ color: "var(--text-1)" }}
            >
              {term}
            </dt>
            <dd
              className="mt-0.5 text-[12px] leading-snug"
              style={{ color: "var(--text-3)" }}
            >
              {meaning}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CardsPanel() {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={
          flipped ? "Show the question again" : "Reveal the answer"
        }
        className="w-full rounded-[12px] border px-4 py-6 text-left transition-colors"
        style={{
          borderColor: "rgb(255 255 255 / 0.1)",
          background:
            "linear-gradient(180deg, rgb(255 255 255 / 0.05), rgb(255 255 255 / 0.02))",
          minHeight: "116px",
        }}
      >
        <p
          className="text-[10.5px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--text-4)" }}
        >
          {flipped ? "Answer" : "Card 7 of 32"}
        </p>
        <p
          className="mt-2 text-[15px] leading-relaxed"
          style={{ color: "var(--text-1)" }}
        >
          {flipped
            ? "It shifts left, toward the reactants — the system absorbs the added product."
            : "Adding more product to a system at equilibrium shifts it which way?"}
        </p>
        {!flipped && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--text-4)" }}>
            Click to flip
          </p>
        )}
      </button>

      <div className="grid grid-cols-4 gap-2">
        {[
          ["Again", "var(--neon-decay)"],
          ["Hard", "var(--warn)"],
          ["Good", "var(--accent-bright)"],
          ["Easy", "var(--neon-green)"],
        ].map(([label, color]) => (
          <span
            key={label}
            className="rounded-lg border py-2 text-center text-[12px] font-medium"
            style={{
              borderColor: "rgb(255 255 255 / 0.1)",
              background: "rgb(255 255 255 / 0.03)",
              color,
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="text-[12px]" style={{ color: "var(--text-4)" }}>
        How hard it felt decides when the card comes back.
      </p>
    </div>
  );
}

function PracticePanel() {
  // Starts unanswered. Picking the wrong option is the point of the demo, so
  // the misconception feedback is what a visitor sees rather than a tick.
  const [picked, setPicked] = useState<string | null>(null);

  const OPTIONS = [
    { id: "a", text: "It shifts right, making more product" },
    { id: "b", text: "It shifts left, using up the added product" },
    { id: "c", text: "Nothing changes — a catalyst was added" },
    { id: "d", text: "The equilibrium constant K increases" },
  ];
  const CORRECT = "b";

  return (
    <div className="flex flex-col gap-3">
      <p
        className="text-[14.5px] leading-relaxed"
        style={{ color: "var(--text-1)" }}
      >
        More product is added to a reaction sitting at equilibrium. What
        happens?
      </p>

      <ul className="flex flex-col gap-1.5">
        {OPTIONS.map((option) => {
          const isPicked = picked === option.id;
          const isCorrect = option.id === CORRECT;
          const reveal = picked !== null;

          let borderColor = "rgb(255 255 255 / 0.09)";
          let background = "rgb(255 255 255 / 0.025)";
          let color = "var(--text-2)";

          if (reveal && isCorrect) {
            borderColor = "rgb(52 227 155 / 0.4)";
            background = "rgb(52 227 155 / 0.09)";
            color = "var(--text-1)";
          } else if (reveal && isPicked) {
            borderColor = "rgb(244 63 94 / 0.4)";
            background = "rgb(244 63 94 / 0.09)";
            color = "var(--text-1)";
          }

          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => setPicked(option.id)}
                disabled={reveal}
                className="flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left text-[13px] transition-colors"
                style={{ borderColor, background, color }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 flex-none items-center justify-center rounded-md text-[11px] font-semibold uppercase"
                  style={{
                    border: "1px solid rgb(255 255 255 / 0.12)",
                    color: "var(--text-4)",
                  }}
                >
                  {option.id}
                </span>
                {option.text}
              </button>
            </li>
          );
        })}
      </ul>

      {picked !== null && (
        <div
          className="rounded-[10px] border p-3"
          style={{
            borderColor: "var(--accent-line)",
            background: "var(--accent-soft)",
          }}
        >
          <p
            className="text-[13px] font-medium"
            style={{ color: "var(--text-1)" }}
          >
            {picked === CORRECT
              ? "Right — and here is why it matters."
              : "Almost. You shifted it the way the change points, not against it."}
          </p>
          <p
            className="mt-1.5 text-[12.5px] leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            Equilibrium always pushes back. Add product and the system consumes
            some of it, shifting left. That is the whole of Le Châtelier.
          </p>
        </div>
      )}

      {picked === null && (
        <p className="text-[12px]" style={{ color: "var(--text-4)" }}>
          Go on — pick the wrong one.
        </p>
      )}
    </div>
  );
}

const PROGRESS_ROWS = [
  { topic: "Equilibrium constants", value: 82, tone: "var(--neon-green)" },
  { topic: "Le Châtelier's principle", value: 38, tone: "var(--neon-decay)" },
  { topic: "Reaction quotient Q", value: 54, tone: "var(--warn)" },
  { topic: "Acid–base titration", value: 91, tone: "var(--neon-green)" },
];

function ProgressPanel({ animate }: { animate: boolean }) {
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
        Answer a few and AceDecks knows which of these will slip first.
      </p>
      <ul className="flex flex-col gap-3">
        {PROGRESS_ROWS.map((row, index) => (
          <li key={row.topic}>
            <div className="flex items-baseline justify-between gap-3">
              <span
                className="truncate text-[13px]"
                style={{ color: "var(--text-2)" }}
              >
                {row.topic}
              </span>
              <span
                className="flex-none text-[12px] font-medium tabular-nums"
                style={{ color: row.tone }}
              >
                {row.value}
              </span>
            </div>
            <div
              className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full"
              style={{ background: "rgb(255 255 255 / 0.06)" }}
              role="progressbar"
              aria-valuenow={row.value}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.topic}: ${row.value} percent`}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: animate ? `${row.value}%` : "0%",
                  background: row.tone,
                  transition: `width 900ms var(--ease-premium-out) ${index * 80}ms`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p
        className="rounded-[10px] border px-3 py-2.5 text-[12.5px] leading-relaxed"
        style={{
          borderColor: "var(--accent-line)",
          background: "var(--accent-soft)",
          color: "var(--text-2)",
        }}
      >
        Next up: Le Châtelier&rsquo;s principle. It is the weakest, and it is
        due.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- demo */

export function ProductDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stageIndex, setStageIndex] = useState(-1);
  const [tab, setTab] = useState<TabId>("guide");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasRun = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const run = useCallback(() => {
    clearTimers();
    setPhase("reading");
    setStageIndex(-1);
    setTab("guide");

    STAGES.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => setStageIndex(i), 380 + i * 520)
      );
    });
    timers.current.push(
      setTimeout(() => setPhase("ready"), 380 + STAGES.length * 520 + 420)
    );
  }, [clearTimers]);

  // Start on intersection, not on mount -- otherwise the whole sequence plays
  // to an empty viewport and the visitor arrives after the interesting part.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      // Start finished. The point is the output, and the output is static.
      hasRun.current = true;
      setPhase("ready");
      setStageIndex(STAGES.length - 1);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasRun.current) {
            hasRun.current = true;
            run();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [run]);

  useEffect(() => clearTimers, [clearTimers]);

  const isReady = phase === "ready";

  /** Clicking a tab skips the intro rather than waiting it out. */
  const selectTab = (id: TabId) => {
    if (!isReady) {
      clearTimers();
      hasRun.current = true;
      setPhase("ready");
      setStageIndex(STAGES.length - 1);
    }
    setTab(id);
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className="relative overflow-hidden rounded-[18px]"
        style={{
          border: "1px solid rgb(255 255 255 / 0.1)",
          background:
            "linear-gradient(180deg, rgb(255 255 255 / 0.045), rgb(255 255 255 / 0.015))",
          boxShadow:
            "0 40px 90px -50px rgb(0 0 0 / 1), inset 0 1px 0 0 rgb(255 255 255 / 0.06)",
        }}
      >
        {/* ---- Window chrome: the file that was dropped ---- */}
        <div
          className="flex items-center gap-2.5 border-b px-4 py-3"
          style={{ borderColor: "rgb(255 255 255 / 0.07)" }}
        >
          <FileText
            className="h-4 w-4 flex-none"
            style={{ color: "var(--accent-bright)" }}
            aria-hidden="true"
          />
          <span
            className="min-w-0 flex-1 truncate text-[13px]"
            style={{ color: "var(--text-2)" }}
          >
            Chemistry Unit 3 — Equilibrium.pdf
          </span>
          {isReady && (
            <button
              type="button"
              onClick={run}
              className="flex-none rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
              style={{ color: "var(--text-4)" }}
            >
              Replay
            </button>
          )}
        </div>

        {/* ---- Reading it ---- */}
        <div
          className="px-4 py-4 sm:px-5"
          // Reserves the tallest panel's height so switching tabs, or the
          // sequence finishing, never moves the page under the reader.
          style={{ minHeight: "336px" }}
        >
          {!isReady ? (
            <div className="flex h-full flex-col justify-center gap-2.5 py-6">
              {STAGES.map((stage, i) => {
                const done = i <= stageIndex;
                return (
                  <div
                    key={stage}
                    className="flex items-center gap-2.5"
                    style={{
                      opacity: done ? 1 : 0.25,
                      transform: done ? "translateY(0)" : "translateY(4px)",
                      transition:
                        "opacity 300ms var(--ease-premium-out), transform 300ms var(--ease-premium-out)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 flex-none items-center justify-center rounded-full"
                      style={{
                        border: `1px solid ${done ? "rgb(52 227 155 / 0.45)" : "rgb(255 255 255 / 0.12)"}`,
                        background: done ? "rgb(52 227 155 / 0.12)" : "transparent",
                      }}
                    >
                      {done && (
                        <Check
                          className="h-3 w-3"
                          style={{ color: "var(--neon-green)" }}
                        />
                      )}
                    </span>
                    <span
                      className="text-[14px]"
                      style={{ color: done ? "var(--text-1)" : "var(--text-3)" }}
                    >
                      {stage}
                      {i === stageIndex + 1 ? "…" : ""}
                    </span>
                  </div>
                );
              })}
              <p
                className="mt-3 text-[12.5px]"
                style={{ color: "var(--text-4)" }}
              >
                About twenty seconds, for real.
              </p>
            </div>
          ) : (
            <div className="rise">
              {tab === "guide" && <GuidePanel />}
              {tab === "cards" && <CardsPanel />}
              {tab === "practice" && <PracticePanel />}
              {tab === "progress" && <ProgressPanel animate />}
            </div>
          )}
        </div>

        {/* ---- What it built ---- */}
        <div
          className="grid grid-cols-2 border-t sm:grid-cols-4"
          style={{ borderColor: "rgb(255 255 255 / 0.07)" }}
          role="tablist"
          aria-label="What AceDecks built from this file"
        >
          {TABS.map(({ id, label, Icon }) => {
            const active = isReady && tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(id)}
                className="flex items-center justify-center gap-2 px-2 py-3 text-[12.5px] font-medium transition-colors"
                style={{
                  color: active ? "var(--text-1)" : "var(--text-3)",
                  background: active ? "rgb(124 106 240 / 0.1)" : "transparent",
                  boxShadow: active
                    ? "inset 0 -2px 0 0 var(--accent-bright)"
                    : "none",
                }}
              >
                <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
