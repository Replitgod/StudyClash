"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/trackEvent";
import { FLOATING_ACTION } from "@/lib/uiLayout";

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

function calculateAccuracy(correctAnswers: number, totalQuestions: number): number {
  if (totalQuestions <= 0) return 0;
  return Math.round((correctAnswers / totalQuestions) * 100);
}

function coerceMatch(value: unknown): Match | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.deck_id !== "string" ||
    typeof candidate.player_name !== "string" ||
    typeof candidate.score !== "number" ||
    typeof candidate.total_questions !== "number" ||
    typeof candidate.correct_answers !== "number" ||
    typeof candidate.time_taken_seconds !== "number"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    deck_id: candidate.deck_id,
    player_name: candidate.player_name,
    score: candidate.score,
    total_questions: candidate.total_questions,
    correct_answers: candidate.correct_answers,
    time_taken_seconds: candidate.time_taken_seconds,
  };
}

function coerceDeck(value: unknown): Deck | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.course_name !== "string" ||
    typeof candidate.student_name !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title,
    course_name: candidate.course_name,
    student_name: candidate.student_name,
  };
}

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center px-4 pt-10 sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

export default function ChallengeLandingPage() {
  const params = useParams();
  const token = params.token as string;

  const [match, setMatch] = useState<Match | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    async function loadChallenge() {
      setIsLoading(true);
      setLoadError(null);
      setMatch(null);
      setDeck(null);

      // The URL only carries an opaque, expiring share token -- resolve it
      // to the real match id server-side before reading anything else.
      const resolveResponse = await fetch(`/api/challenge/${encodeURIComponent(token)}`);
      const resolveData = await resolveResponse.json().catch(() => null);

      if (!resolveResponse.ok || !resolveData?.matchId) {
        setLoadError(
          resolveResponse.status === 410
            ? "This challenge link has expired. Ask your friend for a fresh one."
            : "This challenge link is no longer available."
        );
        setIsLoading(false);
        return;
      }

      const matchId = resolveData.matchId as string;

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .select("id, deck_id, player_name, score, total_questions, correct_answers, time_taken_seconds")
        .eq("id", matchId)
        .single();

      if (matchError || !matchData) {
        setLoadError("This challenge link is no longer available.");
        setIsLoading(false);
        return;
      }

      const normalizedMatch = coerceMatch(matchData);
      if (!normalizedMatch) {
        setLoadError("This challenge is missing required result data.");
        setIsLoading(false);
        return;
      }

      const { data: deckData, error: deckError } = await supabase
        .from("decks")
        .select("id, title, course_name, student_name")
        .eq("id", normalizedMatch.deck_id)
        .single();

      if (deckError || !deckData) {
        setLoadError("This deck is no longer available for challenge play.");
        setIsLoading(false);
        return;
      }

      const normalizedDeck = coerceDeck(deckData);
      if (!normalizedDeck) {
        setLoadError("This challenge deck is missing required data.");
        setIsLoading(false);
        return;
      }

      setMatch(normalizedMatch);
      setDeck(normalizedDeck);
      setIsLoading(false);

      // The top-of-funnel signal the rest of the funnel was missing:
      // challenge_link_copied only tells us a link was generated, and
      // battle_started/finished carry challengeFromMatchId only once
      // someone actually plays -- neither one says whether the friend a
      // link was sent to ever opened it at all.
      void trackEvent("challenge_link_opened", {
        matchId: normalizedMatch.id,
        deckId: normalizedDeck.id,
        challengerName: normalizedMatch.player_name,
      });
    }

    if (token) {
      loadChallenge();
    }
  }, [token]);

  if (isLoading) {
    return (
      <Background>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:p-8">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-indigo-300/40 border-t-cyan-300" />
          <p className="mt-4 text-sm text-white/45">Loading challenge...</p>
        </div>
      </Background>
    );
  }

  if (loadError || !match || !deck) {
    return (
      <Background>
        <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center backdrop-blur-sm sm:p-8">
          <h1 className="text-xl font-black text-red-300">Challenge unavailable</h1>
          <p className="mt-2 text-sm text-red-200/80">
            {loadError || "We could not load this challenge link."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/80 transition-colors duration-150 hover:border-white/20 hover:bg-white/10"
          >
            Go Home
          </Link>
        </div>
      </Background>
    );
  }

  const challengerAccuracy = calculateAccuracy(
    match.correct_answers,
    match.total_questions
  );
  const battleLink = `/battle/${deck.id}?challengeFrom=${match.id}&challengeScore=${challengerAccuracy}`;
  const ghostBattleLink = `/battle/${deck.id}?mode=rival&ghostMatchId=${match.id}&challengeFrom=${match.id}&challengeScore=${challengerAccuracy}`;
  const challengeMessage = `I scored ${challengerAccuracy}% on ${deck.title}. Can you beat me?`;

  const handleCopyChallenge = async () => {
    try {
      await navigator.clipboard.writeText(`${challengeMessage} ${window.location.origin}/challenge/${token}`);
      setCopyStatus("Challenge message copied.");
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus("Unable to copy the challenge message right now.");
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  return (
    <Background>
      <div className="w-full max-w-2xl">
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-200 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300" />
          Challenge Mode
        </div>

        <h1 className="break-words text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-400 to-indigo-400 bg-clip-text text-transparent">
            {deck.title}
          </span>
        </h1>
        <p className="mt-3 break-words text-center text-sm text-white/50">
          {deck.course_name} · Shared by {match.player_name}
        </p>

        {copyStatus && (
          <div className="mt-4 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-center text-sm font-semibold text-indigo-200">
            {copyStatus}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">
            Challenger Score
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Accuracy</p>
              <p className="mt-2 text-2xl font-black text-indigo-300">{challengerAccuracy}%</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Battle Score</p>
              <p className="mt-2 text-2xl font-black text-indigo-300">{match.score} pts</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.06] p-4 text-sm leading-relaxed text-white/75">
            StudyClash turns practice into friendly competition. Open the same deck, try to beat the original score, and compare your result when you finish.
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href={battleLink}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(79,70,229,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
            >
              Start the Same Battle
            </Link>
            <Link
              href={ghostBattleLink}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-5 py-3.5 text-sm font-bold text-indigo-100 transition-colors duration-150 hover:border-indigo-300/60 hover:bg-indigo-500/20"
            >
              Battle Their Ghost
            </Link>
            <button
              type="button"
              onClick={handleCopyChallenge}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-bold text-white/85 transition-colors duration-150 hover:border-indigo-400/40 hover:bg-white/10"
            >
              Copy Challenge Message
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-indigo-100/80">
            Ghost mode replays the challenger&apos;s recorded answers and pacing from their original run.
          </p>

          <p className="mt-3 text-center text-xs text-white/35">
            {challengeMessage}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/65 backdrop-blur-sm">
          <p className="font-bold text-white/85">How it works</p>
          <p className="mt-2 leading-relaxed">
            Pick up the same questions, finish the deck, and StudyClash will show whether you beat the challenge score. No extra setup, no social accounts, just a quick contest.
          </p>
        </div>
      </div>
    </Background>
  );
}
