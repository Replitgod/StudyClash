"use client";

import { useEffect, useState } from "react";

type Scene = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  metric: string;
  callout: string;
};

const SCENES: Scene[] = [
  {
    id: "upload",
    title: "Upload Notes",
    subtitle: "Drop PDF or paste class notes",
    accent: "from-indigo-400/40 to-indigo-400/10",
    metric: "2 files uploaded",
    callout: "Drag and drop works on mobile and desktop",
  },
  {
    id: "generate",
    title: "AI Creates Questions",
    subtitle: "Topic-aware, exam-style prompts",
    accent: "from-indigo-400/40 to-indigo-400/10",
    metric: "15 questions ready",
    callout: "Auto-tuned for level and difficulty",
  },
  {
    id: "battle-ai",
    title: "Battle an AI",
    subtitle: "Easy, Medium, Hard, Adaptive",
    accent: "from-amber-400/40 to-amber-400/10",
    metric: "No lobby",
    callout: "Tap start and answer instantly",
  },
  {
    id: "live",
    title: "Battle Interface",
    subtitle: "Live score + realistic AI timings",
    accent: "from-red-400/40 to-amber-400/10",
    metric: "Round 3 / 5",
    callout: "See your pace vs AI pace",
  },
  {
    id: "winning",
    title: "Victory",
    subtitle: "Instant result with streak feedback",
    accent: "from-green-400/40 to-green-400/10",
    metric: "You 4 • AI 3",
    callout: "Clear winner with next-step actions",
  },
  {
    id: "weak-topics",
    title: "Weak Topic Report",
    subtitle: "Find what to fix next",
    accent: "from-indigo-400/40 to-indigo-400/10",
    metric: "3 key gaps",
    callout: "Target the exact concepts you missed",
  },
  {
    id: "rematch",
    title: "One-click Rematch",
    subtitle: "Retry focused topics immediately",
    accent: "from-indigo-400/40 to-indigo-400/10",
    metric: "Rematch in 1 tap",
    callout: "Momentum stays high after each round",
  },
];

const SCENE_DURATION_MS = 2600;

// A tiny, tasteful mockup per scene instead of generic pulsing gray bars, so
// the loop reads as "a peek at the real product" rather than a wireframe.
function SceneVisual({ sceneId }: { sceneId: string }) {
  if (sceneId === "upload") {
    return (
      <div className="col-span-12 flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 text-sm">📄</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white/90">chem-notes-unit4.pdf</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/20">
            <div className="h-full w-4/5 rounded-full bg-indigo-300 animate-[demoFill_2400ms_ease-out_forwards]" />
          </div>
        </div>
        <span className="flex-shrink-0 text-[11px] font-bold text-green-200">Ready</span>
      </div>
    );
  }

  if (sceneId === "generate") {
    return (
      <div className="col-span-12 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-white/20 bg-white/10 p-2"
            style={{ animation: `pulse-enter 380ms ease-brand-bounce ${i * 120}ms both` }}
          >
            <div className="h-1.5 w-full rounded bg-white/30" />
            <div className="mt-1.5 h-1.5 w-2/3 rounded bg-white/20" />
            <span className="mt-1.5 block text-[9px] font-bold uppercase tracking-wider text-green-200">✓ Ready</span>
          </div>
        ))}
      </div>
    );
  }

  if (sceneId === "battle-ai") {
    return (
      <div className="col-span-12 grid grid-cols-2 gap-1.5">
        {["A", "B", "C", "D"].map((letter, i) => (
          <div
            key={letter}
            className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${
              i === 1
                ? "border-green-300/60 bg-green-400/25 text-white"
                : "border-white/15 bg-white/5 text-white/70"
            }`}
          >
            {letter}. {i === 1 ? "Selected ✓" : "Answer option"}
          </div>
        ))}
      </div>
    );
  }

  if (sceneId === "live") {
    return (
      <div className="col-span-12 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-bold text-white/85">
          <span>You</span>
          <span>AI Opponent</span>
        </div>
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-black/20">
          <div className="h-full w-3/5 bg-indigo-300" />
          <div className="h-full w-2/5 bg-indigo-400/80" />
        </div>
      </div>
    );
  }

  if (sceneId === "winning") {
    return (
      <div className="col-span-12 flex items-center justify-center gap-3 rounded-xl border border-white/20 bg-white/10 px-3 py-3">
        <span className="text-2xl">🏆</span>
        <span className="text-lg font-black text-white">You 4 <span className="text-white/50">·</span> AI 3</span>
      </div>
    );
  }

  if (sceneId === "weak-topics") {
    return (
      <div className="col-span-12 flex flex-wrap gap-1.5">
        {["Cell Division 42%", "Enzymes 58%", "Genetics 65%"].map((label) => (
          <span key={label} className="rounded-full border border-red-300/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-100">
            {label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="col-span-12 flex items-center justify-between rounded-xl border border-white/20 bg-white/10 px-3 py-2.5">
      <span className="text-xs font-semibold text-white/85">Weak-topic rematch ready</span>
      <span className="rounded-lg bg-white/90 px-3 py-1.5 text-[11px] font-black text-[#051320]">Rematch →</span>
    </div>
  );
}

export default function AutoplayDemoRail() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // The global prefers-reduced-motion CSS rule (app/globals.css) only
    // smooths out animation-duration/transition-duration -- it can't stop a
    // JS setInterval from continuing to auto-advance scene content, so that
    // has to be gated explicitly here.
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (query.matches) return;

    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % SCENES.length);
    }, SCENE_DURATION_MS);

    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      aria-label="Autoplay product demo"
      className="w-full rounded-3xl border border-white/15 bg-[#081223]/95 p-4 shadow-[0_40px_90px_-60px_rgba(14,165,233,0.8)] sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <p className="text-xs font-semibold text-white/60">Product preview</p>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${SCENES[index].accent} p-5 sm:p-6`}
      >
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-indigo-300/20 blur-3xl" />

        <div
          key={SCENES[index].id}
          className="relative z-10 min-h-[300px] sm:min-h-[270px]"
          style={{ animation: "slide-up-fade 320ms ease-out" }}
        >
          <div className="inline-flex rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90">
            {SCENES[index].title}
          </div>

          <p className="mt-2 text-sm font-semibold text-white/90">{SCENES[index].subtitle}</p>
          <p className="mt-1 text-xs text-white/75">{SCENES[index].callout}</p>

          <div className="mt-5 grid grid-cols-12 gap-2">
            <SceneVisual sceneId={SCENES[index].id} />
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/20 bg-white/10 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">{SCENES[index].metric}</span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-200" />
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
            <div
              key={`progress-${SCENES[index].id}`}
              className="h-full bg-indigo-300/90 animate-[demoFill_2600ms_linear_forwards]"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {SCENES.map((scene, sceneIndex) => (
          <div
            key={scene.id}
            className={`h-1.5 rounded-full transition-all duration-300 ${sceneIndex === index ? "bg-indigo-300" : "bg-white/20"}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </section>
  );
}
