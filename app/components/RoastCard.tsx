"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "./ui/Card";
import { generateRoastLines, type RoastMatchStats } from "@/lib/roastGenerator";

type RoastCardProps = {
  stats: RoastMatchStats;
  seed: string;
  weakTopicsHref: string | null;
  roastsEnabled: boolean;
  isLoggedIn: boolean;
  onDisable: () => void;
  onShown?: () => void;
};

// Renders the safe, template-based roast lines from lib/roastGenerator.ts
// on the Results page. Guests (not logged in) can still see roasts, but
// their "turn off" choice is session-only since there's no profile row to
// persist it to -- see the isLoggedIn branch below.
export function RoastCard({
  stats,
  seed,
  weakTopicsHref,
  roastsEnabled,
  isLoggedIn,
  onDisable,
  onShown,
}: RoastCardProps) {
  const [guestDisabled, setGuestDisabled] = useState(false);

  const lines = generateRoastLines(stats, seed);
  const visible = roastsEnabled && !guestDisabled && lines.length > 0;

  useEffect(() => {
    if (visible) onShown?.();
    // Only fire once per mount when the card actually has content to show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const isFlawless = lines.length === 1 && lines[0].category === "flawless";

  return (
    <Card tone="indigo" className="border border-indigo-400/25">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">The Roast</p>
        <button
          type="button"
          onClick={() => {
            if (isLoggedIn) {
              onDisable();
            } else {
              setGuestDisabled(true);
            }
          }}
          className="text-xs font-medium text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
        >
          Turn off roasts
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {lines.map((line, index) => (
          <li key={`${line.category}-${index}`} className="text-sm leading-relaxed text-white/85">
            {line.text}
          </li>
        ))}
      </ul>

      {!isFlawless && weakTopicsHref && (
        <Link
          href={weakTopicsHref}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-300 hover:text-indigo-200"
        >
          Prove it wrong -- rematch your weak topics
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      )}

      {!isLoggedIn && (
        <p className="mt-3 text-xs text-white/35">Log in to save this preference across devices.</p>
      )}
    </Card>
  );
}
