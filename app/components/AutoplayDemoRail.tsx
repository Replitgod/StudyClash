"use client";

import { useEffect, useState } from "react";

type Scene = {
  id: string;
  label: string;
  emoji: string;
  accent: string;
};

const SCENES: Scene[] = [
  { id: "upload", label: "Upload notes", emoji: "PDF", accent: "from-sky-400/40 to-cyan-400/10" },
  { id: "generate", label: "AI generates questions", emoji: "AI", accent: "from-violet-400/40 to-fuchsia-400/10" },
  { id: "battle-ai", label: "Battle an AI", emoji: "VS", accent: "from-amber-400/40 to-orange-400/10" },
  { id: "live", label: "Live battle", emoji: "LIVE", accent: "from-rose-400/40 to-orange-400/10" },
  { id: "winning", label: "Winning", emoji: "WIN", accent: "from-emerald-400/40 to-lime-400/10" },
  { id: "weak-topics", label: "Weak-topic report", emoji: "DNA", accent: "from-cyan-400/40 to-blue-400/10" },
  { id: "rematch", label: "One-click rematch", emoji: "REMATCH", accent: "from-fuchsia-400/40 to-purple-400/10" },
];

const SCENE_DURATION_MS = 2600;

export default function AutoplayDemoRail() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % SCENES.length);
    }, SCENE_DURATION_MS);

    return () => window.clearInterval(id);
  }, []);

  return (
    <section aria-label="Autoplay product demo" className="w-full rounded-3xl border border-white/15 bg-[#081223]/95 p-4 shadow-[0_40px_90px_-60px_rgba(14,165,233,0.8)] sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <p className="text-xs font-semibold text-white/60">18s autoplay demo</p>
      </div>

      <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${SCENES[index].accent} p-5 sm:p-6`}>
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10">
          <div className="inline-flex rounded-lg border border-white/25 bg-white/15 px-3 py-1 text-xs font-extrabold tracking-wider text-white/90">
            {SCENES[index].emoji}
          </div>

          <div className="mt-5 grid grid-cols-12 gap-2">
            <div className="col-span-8 space-y-2">
              <div className="h-3 rounded bg-white/30" />
              <div className="h-3 w-4/5 rounded bg-white/25" />
              <div className="h-3 w-3/5 rounded bg-white/20" />
            </div>
            <div className="col-span-4 rounded-xl border border-white/20 bg-white/10 p-2">
              <div className="h-full rounded-lg border border-white/20 bg-white/10" />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-white/20 bg-white/10 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">{SCENES[index].label}</span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-200" />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {SCENES.map((scene, sceneIndex) => (
          <div
            key={scene.id}
            className={`h-1.5 rounded-full transition-all duration-300 ${sceneIndex === index ? "bg-cyan-300" : "bg-white/20"}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </section>
  );
}
