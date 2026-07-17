"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type Deck = {
  id: string;
  student_name: string;
  course_name: string;
  title: string;
  raw_notes: string;
  created_at: string;
};

type MatchEntry = {
  id: string;
  player_name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number;
};

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
      <div className={`relative z-10 flex min-h-dvh flex-col items-center px-4 pt-10 sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

// Lowercases, normalizes smart quotes, and collapses whitespace runs to a
// single space -- mirroring verifySourceExcerpts() on the server -- while
// keeping a per-character map back to the original string's indices. Notes
// pasted from PDFs routinely wrap mid-sentence, so a citation the server
// verified via whitespace-insensitive matching must be locatable the same
// way here, or a "verified" citation would silently fail to highlight.
function buildNormalizedWithIndexMap(text: string): {
  normalized: string;
  originalIndexAt: number[];
} {
  let normalized = "";
  const originalIndexAt: number[] = [];
  let inWhitespace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace) {
        normalized += " ";
        originalIndexAt.push(i);
        inWhitespace = true;
      }
      continue;
    }
    inWhitespace = false;
    const normChar =
      ch === "‘" || ch === "’"
        ? "'"
        : ch === "“" || ch === "”"
        ? '"'
        : ch.toLowerCase();
    normalized += normChar;
    originalIndexAt.push(i);
  }

  return { normalized, originalIndexAt };
}

// Finds a question's cited excerpt within the deck's raw notes (matching
// whitespace-insensitively, same as the server-side verification), so it
// can be wrapped in a <mark> and scrolled to. Returns null if the excerpt
// (or an empty highlight) isn't found -- callers should fall back to
// showing the notes without a highlight.
function splitNotesAroundHighlight(
  notes: string,
  highlight: string
): { before: string; match: string; after: string } | null {
  const trimmedHighlight = highlight.trim();
  if (!trimmedHighlight) return null;

  const { normalized: normNotes, originalIndexAt } = buildNormalizedWithIndexMap(notes);
  const { normalized: normHighlight } = buildNormalizedWithIndexMap(trimmedHighlight);
  if (!normHighlight) return null;

  const normIdx = normNotes.indexOf(normHighlight);
  if (normIdx === -1) return null;

  const startOrig = originalIndexAt[normIdx];
  const endOrig = originalIndexAt[normIdx + normHighlight.length - 1] + 1;

  return {
    before: notes.slice(0, startOrig),
    match: notes.slice(startOrig, endOrig),
    after: notes.slice(endOrig),
  };
}

// Rank badge labels/styles for the top 3 leaderboard spots
const RANK_BADGES: Record<number, { label: string; color: string }> = {
  0: { label: "Champion", color: "from-amber-300 to-amber-500" },
  1: { label: "Runner Up", color: "from-slate-300 to-slate-400" },
  2: { label: "Top 3", color: "from-amber-400 to-amber-700" },
};

export default function DeckDetailPage() {
  const params = useParams();
  const deckId = params.deckId as string;
  const searchParams = useSearchParams();
  const highlightExcerpt = searchParams.get("highlight") || "";
  const highlightRef = useRef<HTMLElement | null>(null);

  const [deck, setDeck] = useState<Deck | null>(null);
  // A "?highlight=" citation link should always land expanded, regardless of
  // the manual toggle state -- derived directly rather than synced via effect.
  const [manualShowFullNotes, setManualShowFullNotes] = useState(false);
  const showFullNotes = manualShowFullNotes || Boolean(highlightExcerpt);
  const [questionCount, setQuestionCount] = useState(0);
  const [matchesPlayed, setMatchesPlayed] = useState(0);
  const [leaderboard, setLeaderboard] = useState<MatchEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkCopyError, setLinkCopyError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDeckDetail() {
      setIsLoading(true);
      setLoadError(null);

      // 1. Load the deck
      const { data: deckData, error: deckError } = await supabase
        .from("decks")
        .select("*")
        .eq("id", deckId)
        .single();

      if (deckError || !deckData) {
        setLoadError(deckError?.message || "This deck could not be found.");
        setIsLoading(false);
        return;
      }

      // 2. Load question count for this deck
      const { count: questionsCount, error: questionsError } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("deck_id", deckId);

      if (questionsError) {
        setLoadError(questionsError.message);
        setIsLoading(false);
        return;
      }

      // 3. Load total matches played count for this deck
      const { count: totalMatchesCount, error: matchesCountError } =
        await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("deck_id", deckId);

      if (matchesCountError) {
        setLoadError(matchesCountError.message);
        setIsLoading(false);
        return;
      }

      // 4. Load top 5 matches for the leaderboard.
      // Sorted by highest score first, then fastest time as the tiebreaker.
      const { data: matchesData, error: matchesError } = await supabase
        .from("matches")
        .select(
          "id, player_name, score, correct_answers, total_questions, time_taken_seconds"
        )
        .eq("deck_id", deckId)
        .order("score", { ascending: false })
        .order("time_taken_seconds", { ascending: true })
        .limit(5);

      if (matchesError) {
        setLoadError(matchesError.message);
        setIsLoading(false);
        return;
      }

      setDeck(deckData);
      setQuestionCount(questionsCount || 0);
      setMatchesPlayed(totalMatchesCount || 0);
      setLeaderboard(matchesData || []);
      setIsLoading(false);
    }

    if (deckId) {
      loadDeckDetail();
    }
  }, [deckId]);

  // A "?highlight=" link from a missed question's citation should land here
  // with the notes already scrolled to the cited excerpt.
  useEffect(() => {
    if (highlightExcerpt && deck && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightExcerpt, deck]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleCopyLink = async () => {
    if (!deck) return;

    const challengeLink = `${window.location.origin}/battle/${deck.id}`;

    try {
      await navigator.clipboard.writeText(challengeLink);
      setLinkCopied(true);
      setLinkCopyError(null);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
      setLinkCopyError("Could not copy link. Please copy it from your browser address bar.");
      setTimeout(() => setLinkCopyError(null), 2600);
    }
  };

  // ---------- Loading state ----------
  if (isLoading) {
    return (
      <Background>
        <svg
          className="h-10 w-10 animate-spin text-indigo-400"
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
        <p className="mt-4 text-sm text-white/50">Loading deck...</p>
      </Background>
    );
  }

  // ---------- Deck-not-found / error state ----------
  if (loadError || !deck) {
    return (
      <Background>
        <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-center sm:p-6">
          <h1 className="text-lg font-bold text-red-300">Deck Not Found</h1>
          <p className="mt-2 text-sm text-red-200/80">
            {loadError ||
              "This deck doesn't exist or may have been removed."}
          </p>
          <Link
            href="/decks"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/80 transition-colors duration-150 hover:border-indigo-400/30 hover:bg-white/10"
          >
            Back to All Decks
          </Link>
        </div>
      </Background>
    );
  }

  return (
    <Background>
      <div className="w-full max-w-2xl">
        {/* Badge */}
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-indigo-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
          DECK DETAILS
        </div>

        {/* Title */}
        <h1 className="break-words text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-400 to-indigo-400 bg-clip-text text-transparent">
            {deck.title}
          </span>
        </h1>
        <p className="mt-3 break-words text-center text-sm text-white/50">
          {deck.course_name}
        </p>

        {/* Deck info card */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-8 sm:p-6 md:p-8">
          {linkCopyError && (
            <p className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {linkCopyError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <div className="flex items-center justify-center gap-1.5 text-white/40">
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Creator
                </span>
              </div>
              <p className="mt-1.5 truncate text-sm font-bold text-white/90">
                {deck.student_name}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <div className="flex items-center justify-center gap-1.5 text-white/40">
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25"
                  />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Questions
                </span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-white/90">
                {questionCount}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <div className="flex items-center justify-center gap-1.5 text-white/40">
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"
                  />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Played
                </span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-white/90">
                {matchesPlayed}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <div className="flex items-center justify-center gap-1.5 text-white/40">
                <svg
                  className="h-4 w-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                  />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Created
                </span>
              </div>
              <p className="mt-1.5 text-sm font-bold text-white/90">
                {formatDate(deck.created_at)}
              </p>
            </div>
          </div>

          {/* Notes preview */}
          {deck.raw_notes && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  {showFullNotes ? "Notes" : "Notes Preview"}
                </p>
                <button
                  type="button"
                  onClick={() => setManualShowFullNotes((prev) => !prev)}
                  className="text-[10px] font-semibold text-indigo-300 hover:text-indigo-200"
                >
                  {showFullNotes ? "Show less" : "View full notes"}
                </button>
              </div>
              {showFullNotes ? (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-white/70">
                  {(() => {
                    const split = splitNotesAroundHighlight(
                      deck.raw_notes,
                      highlightExcerpt
                    );
                    if (!split) return deck.raw_notes;
                    return (
                      <>
                        {split.before}
                        <mark
                          ref={highlightRef}
                          className="rounded bg-indigo-500 px-0.5 text-white"
                        >
                          {split.match}
                        </mark>
                        {split.after}
                      </>
                    );
                  })()}
                </p>
              ) : (
                <p className="mt-1.5 line-clamp-3 break-words text-sm text-white/60">
                  {deck.raw_notes}
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/battle/${deck.id}`}
              className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(79,70,229,0.6)] transition-transform duration-200 active:scale-95 sm:px-8 sm:hover:scale-[1.02]"
            >
              <span className="relative z-10">Play Battle</span>
              <svg
                className="relative z-10 h-5 w-5 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1"
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

            <button
              onClick={handleCopyLink}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-base font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-indigo-400/40 hover:bg-white/10"
            >
              {linkCopied ? (
                <>
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-green-400"
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
                    className="h-5 w-5 flex-shrink-0 text-indigo-300"
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
        </div>

        {/* Leaderboard */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-8 sm:p-6 md:p-8">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0 text-indigo-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0"
              />
            </svg>
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">
              Top Scores
            </p>
          </div>

          {leaderboard.length === 0 ? (
            <p className="mt-4 text-sm text-white/40">
              No scores yet. Be the first to play.
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-2">
              {leaderboard.map((entry, index) => {
                const entryAccuracy = Math.round(
                  (entry.correct_answers / entry.total_questions) * 100
                );
                const badge = RANK_BADGES[index];
                const isTopScore = index === 0;

                return (
                  <div
                    key={entry.id}
                    className={`rounded-xl border px-3 py-3 transition-colors duration-150 sm:px-4 ${
                      isTopScore
                        ? "border-amber-400/40 bg-gradient-to-r from-amber-500/10 to-amber-500/5 shadow-[0_0_20px_-5px_rgba(250,204,21,0.3)]"
                        : "border-white/10 bg-black/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            isTopScore
                              ? "bg-gradient-to-br from-amber-300 to-amber-500 text-black"
                              : "bg-gradient-to-br from-indigo-500/20 to-indigo-500/20 text-indigo-300"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <p className="truncate text-sm font-bold text-white/90">
                          {entry.player_name}
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 text-sm font-bold ${
                          isTopScore ? "text-amber-300" : "text-indigo-300"
                        }`}
                      >
                        {entry.score} pts
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                      <p className="text-[10px] text-white/40">
                        {entryAccuracy}% accuracy ·{" "}
                        {formatTime(entry.time_taken_seconds)}
                      </p>
                      {badge && (
                        <span
                          className={`rounded-full bg-gradient-to-r ${badge.color} px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Background>
  );
}