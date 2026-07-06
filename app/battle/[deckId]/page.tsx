"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Question = {
  id: string;
  deck_id: string;
  question_text: string;
  answer_choices: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: string;
};

type Deck = {
  id: string;
  title: string;
  course_name: string;
  student_name: string;
};

type AnswerRecord = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
};

type LeaderboardEntry = {
  id: string;
  player_name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number;
};

const CHOICE_LETTERS = ["A", "B", "C", "D"];

// Rank badge labels/styles for the top 3 leaderboard spots
const RANK_BADGES: Record<number, { label: string; color: string }> = {
  0: { label: "Champion", color: "from-yellow-300 to-amber-500" },
  1: { label: "Runner Up", color: "from-slate-300 to-slate-400" },
  2: { label: "Top 3", color: "from-orange-400 to-amber-700" },
};

// Defined OUTSIDE the page component so it keeps a stable identity across
// re-renders. If this were defined inside BattlePage, every re-render
// (e.g. every keystroke in the name input) would create a "new" component
// type, forcing React to remount the whole subtree underneath it —
// including the name input — causing it to lose focus after each letter.
function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
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
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
        {children}
      </div>
    </main>
  );
}

export default function BattlePage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.deckId as string;

  // Loading the deck + questions
  const [deck, setDeck] = useState<Deck | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Leaderboard (top 5 scores for this deck)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);

  // Optional name input for challengers. This is UNCONTROLLED — typing
  // updates the DOM input directly via the browser, not React state — so
  // no re-render happens per keystroke, keeping it smooth. We only read
  // the value once, when "Start Battle" is clicked.
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [playerName, setPlayerName] = useState("");
  const [hasStarted, setHasStarted] = useState(false);

  // Quiz progress
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  // Timer (counts up in seconds while the battle is in progress)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Tracks when the current question was first shown, so we can measure
  // how long the player took to answer it (response_time_ms).
  const questionShownAtRef = useRef<number>(Date.now());

  // Saving the finished match
  const [isFinishing, setIsFinishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load the deck and its questions when the page mounts
  useEffect(() => {
    async function loadBattle() {
      setIsLoading(true);
      setLoadError(null);

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

      const { data: questionsData, error: questionsError } = await supabase
        .from("questions")
        .select("*")
        .eq("deck_id", deckId);

      if (questionsError || !questionsData || questionsData.length === 0) {
        setLoadError(
          questionsError?.message || "No questions were found for this deck."
        );
        setIsLoading(false);
        return;
      }

      setDeck(deckData);
      setQuestions(questionsData);
      setIsLoading(false);
    }

    if (deckId) {
      loadBattle();
    }
  }, [deckId]);

  // Load the top 5 scores for this deck's leaderboard.
  // Sorted by highest score first, then fastest time as the tiebreaker.
  useEffect(() => {
    async function loadLeaderboard() {
      setIsLeaderboardLoading(true);

      const { data, error } = await supabase
        .from("matches")
        .select(
          "id, player_name, score, correct_answers, total_questions, time_taken_seconds"
        )
        .eq("deck_id", deckId)
        .order("score", { ascending: false })
        .order("time_taken_seconds", { ascending: true })
        .limit(5);

      if (!error && data) {
        setLeaderboard(data);
      }

      setIsLeaderboardLoading(false);
    }

    if (deckId) {
      loadLeaderboard();
    }
  }, [deckId]);

  // Simple timer: ticks up once per second while playing
  useEffect(() => {
    if (!hasStarted || isFinishing) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasStarted, isFinishing]);

  // Reset the "question shown at" clock every time we move to a new question
  useEffect(() => {
    if (hasStarted) {
      questionShownAtRef.current = Date.now();
    }
  }, [currentIndex, hasStarted]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    const typedName = nameInputRef.current?.value.trim() || "";
    // If the challenger left the name field blank, fall back to the
    // deck creator's name (deck.student_name) — same as before.
    const finalName = typedName || deck?.student_name || "Player";

    setPlayerName(finalName);
    setHasStarted(true);
  };

  const handleSelectAnswer = (choice: string) => {
    if (selectedChoice) return; // question already answered

    const currentQuestion = questions[currentIndex];
    const isCorrect = choice === currentQuestion.correct_answer;
    const responseTimeMs = Date.now() - questionShownAtRef.current;

    setSelectedChoice(choice);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        selectedAnswer: choice,
        isCorrect,
        responseTimeMs,
      },
    ]);
  };

  const handleNext = useCallback(async () => {
    const isLastQuestion = currentIndex === questions.length - 1;

    if (!isLastQuestion) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedChoice(null);
      return;
    }

    // This was the last question — save the finished match
    setIsFinishing(true);
    setSaveError(null);

    const correctCount = answers.filter((a) => a.isCorrect).length;

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .insert({
        deck_id: deckId,
        player_name: playerName || deck?.student_name || "Player",
        score: correctCount,
        total_questions: questions.length,
        correct_answers: correctCount,
        time_taken_seconds: elapsedSeconds,
      })
      .select()
      .single();

    if (matchError || !matchData) {
      setSaveError(matchError?.message || "Failed to save your match.");
      setIsFinishing(false);
      return;
    }

    // No match_answers table exists in the schema, so per-question answers
    // (including response_time_ms) are saved to sessionStorage instead.
    // The results page reads this to build the Weak Topic Report.
    try {
      sessionStorage.setItem(
        `studyclash-answers-${matchData.id}`,
        JSON.stringify(answers)
      );
    } catch {
      // Fails silently if sessionStorage is unavailable — not critical.
    }

    router.push(`/results/${matchData.id}`);
  }, [
    currentIndex,
    questions,
    answers,
    deckId,
    deck,
    playerName,
    elapsedSeconds,
    router,
  ]);

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
        <p className="mt-4 text-sm text-white/50">Loading battle...</p>
      </Background>
    );
  }

  // ---------- Error state ----------
  if (loadError || !deck || questions.length === 0) {
    return (
      <Background>
        <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-center sm:p-6">
          <h1 className="text-lg font-bold text-red-300">
            Couldn&apos;t load this battle
          </h1>
          <p className="mt-2 text-sm text-red-200/80">
            {loadError || "Something went wrong."}
          </p>
        </div>
      </Background>
    );
  }

  // ---------- Start screen ----------
  if (!hasStarted) {
    return (
      <Background>
        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          BATTLE READY
        </div>

        <h1 className="max-w-full text-center text-3xl font-black tracking-tight break-words sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            {deck.title}
          </span>
        </h1>
        <p className="mt-2 text-center text-sm text-white/50">
          {deck.course_name} · {questions.length} questions
        </p>

        <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:mt-10 sm:p-6">
          <label
            htmlFor="challengerName"
            className="text-xs font-bold uppercase tracking-wider text-white/60"
          >
            Playing As (optional)
          </label>
          <input
            id="challengerName"
            ref={nameInputRef}
            type="text"
            defaultValue=""
            placeholder={deck.student_name}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleStart();
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:text-sm"
          />
          <p className="mt-1.5 text-[11px] text-white/30">
            Leave blank to play as {deck.student_name}
          </p>

          <button
            onClick={handleStart}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
          >
            Start Battle
          </button>
        </div>

        {/* Leaderboard */}
        <div className="mt-6 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:mt-8 sm:p-6">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 flex-shrink-0 text-cyan-300"
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

          {isLeaderboardLoading && (
            <p className="mt-3 text-sm text-white/40">Loading leaderboard...</p>
          )}

          {!isLeaderboardLoading && leaderboard.length === 0 && (
            <p className="mt-3 text-sm text-white/40">
              No scores yet. Be the first to play.
            </p>
          )}

          {!isLeaderboardLoading && leaderboard.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {leaderboard.map((entry, index) => {
                const entryAccuracy = Math.round(
                  (entry.correct_answers / entry.total_questions) * 100
                );
                const badge = RANK_BADGES[index];
                const isTopScore = index === 0;

                return (
                  <div
                    key={entry.id}
                    className={`rounded-xl border px-3 py-3 transition-colors duration-150 ${
                      isTopScore
                        ? "border-yellow-400/40 bg-gradient-to-r from-yellow-500/10 to-amber-500/5 shadow-[0_0_20px_-5px_rgba(250,204,21,0.3)]"
                        : "border-white/10 bg-black/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            isTopScore
                              ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-black"
                              : "bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-fuchsia-300"
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
                          isTopScore ? "text-yellow-300" : "text-cyan-300"
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
      </Background>
    );
  }

  // ---------- Saving state ----------
  if (isFinishing) {
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
        <p className="mt-4 text-sm text-white/50">Saving your results...</p>

        {saveError && (
          <div className="mt-5 w-full max-w-md rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            {saveError}
          </div>
        )}
      </Background>
    );
  }

  // ---------- Quiz in progress ----------
  const currentQuestion = questions[currentIndex];
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;
  const showFeedback = selectedChoice !== null;
  const answeredCorrectly = selectedChoice === currentQuestion.correct_answer;

  return (
    <Background>
      <div className="w-full max-w-2xl">
        {/* Top bar: progress + timer */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 sm:mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-bold text-cyan-300">
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
                d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {formatTime(elapsedSeconds)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-white/10 sm:mb-8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Question card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-6 md:p-8">
          <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
            {currentQuestion.topic}
          </span>
          <h2 className="mt-3 text-base font-bold leading-snug break-words sm:text-lg md:text-xl">
            {currentQuestion.question_text}
          </h2>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:gap-3">
            {currentQuestion.answer_choices.map((choice, i) => {
              const isSelected = selectedChoice === choice;
              const isCorrectChoice = choice === currentQuestion.correct_answer;

              // Default (unanswered) style
              let choiceStyles =
                "border-white/10 bg-black/30 hover:border-fuchsia-400/40 hover:bg-white/5";
              let resultIcon: string | null = null;

              if (showFeedback) {
                if (isCorrectChoice) {
                  // Always highlight the correct answer once answered
                  choiceStyles =
                    "border-emerald-400/50 bg-emerald-500/10";
                  resultIcon = "✅";
                } else if (isSelected) {
                  // The wrong answer the user picked
                  choiceStyles = "border-red-400/50 bg-red-500/10";
                  resultIcon = "❌";
                } else {
                  // Other wrong answers — muted, not the focus
                  choiceStyles = "border-white/5 bg-black/20 opacity-40";
                  resultIcon = "❌";
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelectAnswer(choice)}
                  disabled={showFeedback}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-all duration-200 disabled:cursor-default sm:py-3 sm:text-base ${choiceStyles}`}
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white/70">
                    {CHOICE_LETTERS[i]}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-white/90">
                    {choice}
                  </span>
                  {resultIcon && (
                    <span className="flex-shrink-0 text-lg leading-none">
                      {resultIcon}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation shown after answering */}
          {showFeedback && (
            <div
              className={`mt-5 rounded-xl border px-4 py-3.5 text-sm ${
                answeredCorrectly
                  ? "border-emerald-400/30 bg-emerald-500/5"
                  : "border-red-400/30 bg-red-500/5"
              }`}
            >
              <p
                className={`text-xs font-bold uppercase tracking-wider ${
                  answeredCorrectly ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {answeredCorrectly ? "Correct!" : "Not quite"}
              </p>

              {!answeredCorrectly && (
                <p className="mt-2 break-words text-white/70">
                  You chose{" "}
                  <span className="font-semibold text-red-300">
                    {selectedChoice}
                  </span>
                  . The correct answer is{" "}
                  <span className="font-semibold text-emerald-300">
                    {currentQuestion.correct_answer}
                  </span>
                  .
                </p>
              )}

              <p className="mt-2 break-words text-white/60">
                {currentQuestion.explanation}
              </p>
            </div>
          )}

          {/* Next / Finish button */}
          {showFeedback && (
            <button
              onClick={handleNext}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:px-8 sm:hover:scale-[1.02]"
            >
              {currentIndex === questions.length - 1
                ? "Finish Battle"
                : "Next Question"}
              <svg
                className="h-5 w-5 flex-shrink-0"
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
            </button>
          )}
        </div>
      </div>
    </Background>
  );
}