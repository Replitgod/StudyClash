"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Match = {
  id: string;
  deck_id: string;
  player_name: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  time_taken_seconds: number;
};

type Deck = {
  id: string;
  title: string;
  course_name: string;
  student_name: string;
};

// Simple rank tiers based on accuracy percentage
function getRank(accuracyPercent: number): {
  label: string;
  message: string;
  color: string;
} {
  if (accuracyPercent === 100) {
    return {
      label: "Flawless Victory",
      message: "Perfect score! You completely dominated this deck.",
      color: "from-fuchsia-400 to-cyan-400",
    };
  }
  if (accuracyPercent >= 80) {
    return {
      label: "Champion",
      message: "Excellent work — you clearly know this material.",
      color: "from-emerald-400 to-cyan-400",
    };
  }
  if (accuracyPercent >= 60) {
    return {
      label: "Contender",
      message: "Solid effort! A bit more review and you'll be unstoppable.",
      color: "from-cyan-400 to-violet-400",
    };
  }
  if (accuracyPercent >= 40) {
    return {
      label: "Rookie",
      message: "Good start — revisit your notes and challenge this deck again.",
      color: "from-violet-400 to-fuchsia-400",
    };
  }
  return {
    label: "Needs Training",
    message: "Tough round. Review the material and come back stronger.",
    color: "from-red-400 to-fuchsia-400",
  };
}

export default function ResultsPage() {
  const params = useParams();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<Match | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    async function loadResults() {
      setIsLoading(true);
      setLoadError(null);

      // 1. Load the match
      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("*")
        .eq("id", matchId)
        .single();

      if (matchError || !matchData) {
        setLoadError(matchError?.message || "This match could not be found.");
        setIsLoading(false);
        return;
      }

      // 2. Load the related deck
      const { data: deckData, error: deckError } = await supabase
        .from("decks")
        .select("*")
        .eq("id", matchData.deck_id)
        .single();

      if (deckError || !deckData) {
        setLoadError(deckError?.message || "This deck could not be found.");
        setIsLoading(false);
        return;
      }

      setMatch(matchData);
      setDeck(deckData);
      setIsLoading(false);
    }

    if (matchId) {
      loadResults();
    }
  }, [matchId]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleCopyLink = async () => {
    if (!deck) return;

    const challengeLink = `${window.location.origin}/battle/${deck.id}`;

    try {
      await navigator.clipboard.writeText(challengeLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API can fail in some browsers/contexts (e.g. no HTTPS).
      // Fail quietly rather than breaking the page.
      setLinkCopied(false);
    }
  };

  // ---------- Shared background wrapper ----------
  const Background = ({ children }: { children: React.ReactNode }) => (
    <main className="relative min-h-screen overflow-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">
        {children}
      </div>
    </main>
  );

  // ---------- Loading state ----------
  if (isLoading) {
    return (
      <Background>
        <svg
          className="h-10 w-10 animate-spin text-fuchsia-400"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="mt-4 text-sm text-white/50">Loading results...</p>
      </Background>
    );
  }

  // ---------- Error state ----------
  if (loadError || !match || !deck) {
    return (
      <Background>
        <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
          <h1 className="text-lg font-bold text-red-300">
            Couldn&apos;t load these results
          </h1>
          <p className="mt-2 text-sm text-red-200/80">
            {loadError || "Something went wrong."}
          </p>
        </div>
      </Background>
    );
  }

  // ---------- Results ----------
  const accuracyPercent = Math.round(
    (match.correct_answers / match.total_questions) * 100
  );
  const wrongAnswers = match.total_questions - match.correct_answers;
  const rank = getRank(accuracyPercent);

  return (
    <Background>
      <div className="w-full max-w-xl">
        {/* Badge */}
        <div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          BATTLE COMPLETE
        </div>

        {/* Title */}
        <h1 className="text-center text-4xl font-black tracking-tight sm:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Nice Work, {match.player_name}!
          </span>
        </h1>
        <p className="mt-3 text-center text-sm text-white/50">
          {deck.title} · {deck.course_name}
        </p>

        {/* Score card */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
          {/* Big score */}
          <div className="text-center">
            <span className="text-6xl font-black bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent sm:text-7xl">
              {match.score}
            </span>
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/40">
              Points
            </p>
          </div>

          {/* Rank badge */}
          <div className="mt-5 flex flex-col items-center gap-1.5 text-center">
            <span
              className={`rounded-full bg-gradient-to-r ${rank.color} px-4 py-1 text-xs font-bold uppercase tracking-wider text-black`}
            >
              {rank.label}
            </span>
            <p className="max-w-sm text-xs text-white/50 sm:text-sm">
              {rank.message}
            </p>
          </div>

          {/* Stat grid */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center">
              <p className="text-lg font-bold text-emerald-300 sm:text-xl">
                {match.correct_answers}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                Correct
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center">
              <p className="text-lg font-bold text-red-300 sm:text-xl">
                {wrongAnswers}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                Wrong
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center">
              <p className="text-lg font-bold text-cyan-300 sm:text-xl">
                {accuracyPercent}%
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                Accuracy
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center">
              <p className="text-lg font-bold text-violet-300 sm:text-xl">
                {formatTime(match.time_taken_seconds)}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                Time
              </p>
            </div>
          </div>

          {/* Copy challenge link */}
          <button
            onClick={handleCopyLink}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-400/40 hover:bg-white/10"
          >
            {linkCopied ? (
              <>
                <svg
                  className="h-4 w-4 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4 text-cyan-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                  />
                </svg>
                Copy Challenge Link
              </>
            )}
          </button>
        </div>

        {/* Action buttons */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/battle/${deck.id}`}
            className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 hover:scale-[1.02] active:scale-95"
          >
            <span className="relative z-10">Play Again</span>
            <svg
              className="relative z-10 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
          </Link>

          <Link
            href="/create"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-4 text-base font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10"
          >
            Create New Deck
          </Link>
        </div>
      </div>
    </Background>
  );
}