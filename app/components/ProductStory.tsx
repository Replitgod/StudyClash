"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { MASTERY_TIER_LABELS } from "@/lib/masteryTiers";

// Six stages of the actual, verified core loop (upload -> generate ->
// battle -> weak-topic detection -> rematch -> mastery tracking) -- not the
// diagnostic-centric "personalized plan" framing some design references
// use, since that's a specific SAT-diagnostic sub-feature, not the general
// entry point for arbitrary uploaded notes. Every claim here matches real,
// shipped behavior verified elsewhere in this codebase this session.
type Stage = {
  id: string;
  title: string;
  body: string;
};

const STAGES: Stage[] = [
  {
    id: "upload",
    title: "Upload your material",
    body: "Notes, a PDF, or just a topic. No formatting required.",
  },
  {
    id: "map",
    title: "AcedIQ maps the content",
    body: "Every generated question is tagged with a real topic and difficulty, not left unsorted.",
  },
  {
    id: "battle",
    title: "You battle to find gaps",
    body: "Answer live against an AI or a friend -- a wrong answer is the actual signal, not a guess.",
  },
  {
    id: "weak-topics",
    title: "Weak topics get flagged",
    body: "Misses are grouped by topic so a real pattern shows up, not just a raw score.",
  },
  {
    id: "rematch",
    title: "Rematch targets exactly that",
    body: "One tap starts a fresh rematch scoped to only the topics you missed.",
  },
  {
    id: "mastery",
    title: "Mastery improves, measurably",
    body: `Every topic moves through ${MASTERY_TIER_LABELS.needs_review} → ${MASTERY_TIER_LABELS.developing} → ${MASTERY_TIER_LABELS.strong} → ${MASTERY_TIER_LABELS.mastered} as evidence builds -- never called Mastered from one lucky guess.`,
  },
];

function StageVisual({ stageId, className }: { stageId: string; className?: string }) {
  if (stageId === "upload") {
    return (
      <div className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 ${className || ""}`}>
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-base">📄</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white/90">unit-4-notes.pdf</p>
          <p className="mt-0.5 text-[11px] text-white/50">Ready to generate</p>
        </div>
      </div>
    );
  }
  if (stageId === "map") {
    return (
      <div className={`flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3 ${className || ""}`}>
        {["Linear Equations", "Cell Respiration", "Supply & Demand"].map((t) => (
          <span key={t} className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-200">
            {t}
          </span>
        ))}
      </div>
    );
  }
  if (stageId === "battle") {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/5 p-3 ${className || ""}`}>
        <p className="text-xs font-semibold text-white/80">What is the slope of y = 3x + 2?</p>
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">2 ✕</div>
          <div className="rounded-lg border border-green-400/30 bg-green-500/10 px-2.5 py-1.5 text-[11px] text-green-200">3 ✓</div>
        </div>
      </div>
    );
  }
  if (stageId === "weak-topics") {
    return (
      <div className={`flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3 ${className || ""}`}>
        {[
          { topic: "Linear Equations", pct: 40 },
          { topic: "Cell Respiration", pct: 88 },
        ].map((row) => (
          <div key={row.topic} className="flex items-center gap-2">
            <span className="w-28 flex-shrink-0 truncate text-[11px] text-white/70">{row.topic}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${row.pct < 50 ? "bg-red-400" : "bg-green-400"}`}
                style={{ width: `${row.pct}%` }}
              />
            </div>
            <span className="w-8 flex-shrink-0 text-right text-[11px] font-bold text-white/60">{row.pct}%</span>
          </div>
        ))}
      </div>
    );
  }
  if (stageId === "rematch") {
    return (
      <div className={`flex items-center justify-between rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-3 ${className || ""}`}>
        <span className="text-xs font-bold text-indigo-100">Rematch Weak Topics</span>
        <span className="text-indigo-300">→</span>
      </div>
    );
  }
  // mastery
  return (
    <div className={`flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3 ${className || ""}`}>
      <span className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-200">
        {MASTERY_TIER_LABELS.needs_review}
      </span>
      <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">
        {MASTERY_TIER_LABELS.developing}
      </span>
      <span className="rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-200">
        {MASTERY_TIER_LABELS.strong}
      </span>
      <span className="rounded-full border border-green-400/25 bg-green-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-green-200">
        {MASTERY_TIER_LABELS.mastered}
      </span>
    </div>
  );
}

function StageBlock({
  stage,
  index,
  onActivate,
}: {
  stage: Stage;
  index: number;
  onActivate: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // amount: 0.5 + a centered margin approximates "this block is roughly at
  // the middle of the viewport" -- close enough to a real scrollytelling
  // trigger without pulling in a scroll-progress library for one section.
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });

  useEffect(() => {
    if (inView) onActivate(index);
  }, [inView, index, onActivate]);

  return (
    <div ref={ref} className="py-8 lg:py-16">
      <span className="text-xs font-bold uppercase tracking-wider text-brand-primary-emphasis">
        {String(index + 1).padStart(2, "0")}
      </span>
      <h3 className="mt-2 text-xl font-bold text-white sm:text-2xl">{stage.title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-[#8B93B0]">{stage.body}</p>
      {/* Mobile: each card carries its own visual since the sticky preview
          panel is desktop-only (lg:block) -- nothing is lost on small
          screens, per the "no complicated sticky layout on mobile" rule. */}
      <div className="mt-4 lg:hidden">
        <StageVisual stageId={stage.id} />
      </div>
    </div>
  );
}

export function ProductStory() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
      <div className="hidden lg:block">
        <div className="sticky top-24 rounded-2xl border border-white/10 bg-[#0B1220] p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-white/40">
            {STAGES[activeIndex].title}
          </p>
          <motion.div
            key={STAGES[activeIndex].id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-4"
          >
            <StageVisual stageId={STAGES[activeIndex].id} className="min-h-[120px]" />
          </motion.div>
        </div>
      </div>

      <div>
        {STAGES.map((stage, index) => (
          <StageBlock key={stage.id} stage={stage} index={index} onActivate={setActiveIndex} />
        ))}
      </div>
    </div>
  );
}
