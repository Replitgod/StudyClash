"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { springSmooth, REDUCED_MOTION_TRANSITION } from "@/lib/motion";

type Accent = "amber" | "indigo";

const ACCENT: Record<Accent, { ring: string; text: string; wash: string }> = {
  amber: { ring: "border-amber-400/30", text: "text-amber-300", wash: "bg-amber-500/[0.05]" },
  indigo: { ring: "border-white/10", text: "text-indigo-300", wash: "bg-black/20" },
};

// Expandable "bento" deck row -- collapses to title + one headline stat, and
// on click morphs open (a real height/layout transition on springSmooth, not
// a display toggle) to reveal the detail that makes the accuracy signal
// actionable: matches played, best score, last played, and a scoped rematch.
// That "reveal more of an existing signal" is the reason it clears the
// mastery-first feature gate rather than being decorative expansion.
export function BentoDeckCard({
  id,
  title,
  courseN,
  headlineStat,
  matchesPlayed,
  bestScore,
  lastPlayedLabel,
  accent = "indigo",
}: {
  id: string;
  title: string;
  courseN: string;
  headlineStat?: string;
  matchesPlayed?: number;
  bestScore?: number;
  lastPlayedLabel?: string;
  accent?: Accent;
}) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const a = ACCENT[accent];

  return (
    <motion.div
      layout={!reducedMotion}
      transition={reducedMotion ? REDUCED_MOTION_TRANSITION : springSmooth}
      className={`overflow-hidden rounded-xl border ${a.ring} ${a.wash} transition-shadow duration-300 ${
        open ? "shadow-depth-2" : "shadow-depth-1"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{title}</span>
          <span className="block truncate text-xs text-[var(--text-3)]">{courseN}</span>
          {headlineStat ? <span className={`mt-0.5 block text-xs ${a.text}`}>{headlineStat}</span> : null}
        </span>
        <motion.svg
          animate={{ rotate: open ? 90 : 0 }}
          transition={reducedMotion ? REDUCED_MOTION_TRANSITION : springSmooth}
          className={`h-4 w-4 flex-shrink-0 ${a.text}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={reducedMotion ? REDUCED_MOTION_TRANSITION : { ...springSmooth, opacity: { duration: 0.15 } }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/10 px-3 py-3">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-white/[0.03] py-2">
                  <dt className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Matches</dt>
                  <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white">{matchesPlayed ?? "—"}</dd>
                </div>
                <div className="rounded-lg bg-white/[0.03] py-2">
                  <dt className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Best</dt>
                  <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white">{bestScore ?? "—"}</dd>
                </div>
                <div className="rounded-lg bg-white/[0.03] py-2">
                  <dt className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Last</dt>
                  <dd className="mt-0.5 text-xs font-semibold text-white/80">{lastPlayedLabel ?? "—"}</dd>
                </div>
              </dl>
              <Link
                href={`/battle/${id}`}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-sm font-bold text-white transition-colors duration-150 hover:bg-brand-primary-emphasis"
              >
                Rematch this deck
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
