"use client";

import { useEffect, useState, useCallback } from "react";
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

// Defined OUTSIDE the page component so it keeps a stable identity across
// re-renders, preventing the whole subtree from remounting on state changes.
function Background({ children }: { children: React.ReactNode }) {
  return (
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

  // Start screen — no name input needed, we already have deck.student_name
  const [hasStarted, setHasStarted] = useState(false);

  // Quiz progress
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  // Timer (counts up in seconds while the battle is in progress)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  // Load the top 5 scores for this deck's leaderboard
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

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    setHasStarted(true);
  };

  const handleSelectAnswer = (choice: string) => {
    if (selectedChoice) return; // question already answered

    const currentQuestion = questions[currentIndex];
    const isCorrect = choice === currentQuestion.correct_answer;

    setSelectedChoice(choice);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        selectedAnswer: choice,
        isCorrect,
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
        player_name: deck?.student_name || "Player",
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

    router.push(`/results/${matchData.id}`);
  }, [currentIndex, questions, answers, deckId, deck, elapsedSeconds, router]);

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
        <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
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
        <div className="mb-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          BATTLE READY
        </div>

        <h1 className="text-center text-4xl font-black tracking-tight sm:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            {deck.title}
          </span>
        </h1>
        <p className="mt-2 text-center text-sm text-white/50">
          {deck.course_name} · {questions.length} questions
        </p>

        <div className="mt-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">
            Playing As
          </p>
          <p className="mt-2 text-lg font-bold text-white">
            {deck.student_name}
          </p>

          <button
            onClick={handleStart}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 hover:scale-[1.02] active:scale-95"
          >
            Start Battle
          </button>
        </div>

        {/* Leaderboard */}
        <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-2">
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
              No battles played yet. Be the first!
            </p>
          )}

          {!isLeaderboardLoading && leaderboard.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {leaderboard.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-xs font-bold text-fuchsia-300">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white/90">
                        {entry.player_name}
                      </p>
                      <p className="text-[10px] text-white/40">
                        {entry.correct_answers}/{entry.total_questions} correct ·{" "}
                        {formatTime(entry.time_taken_seconds)}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-cyan-300">
                    {entry.score}
                  </span>
                </div>
              ))}
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
          <div className="mt-5 max-w-md rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            {saveError}
          </div>
        )}
      </Background>
    );
  }

  // ---------- Quiz in progress ----------
  const currentQuestion = questions[currentIndex];
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;

  return (
    <Background>
      <div className="w-full max-w-2xl">
        {/* Top bar: progress + timer */}
        <div className="mb-6 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-bold text-cyan-300">
            <svg
              className="h-4 w-4"
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
        <div className="mb-8 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Question card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
          <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
            {currentQuestion.topic}
          </span>
          <h2 className="mt-3 text-lg font-bold leading-snug sm:text-xl">
            {currentQuestion.question_text}
          </h2>

          <div className="mt-6 flex flex-col gap-3">
            {currentQuestion.answer_choices.map((choice, i) => {
              const isSelected = selectedChoice === choice;
              const isCorrectChoice = choice === currentQuestion.correct_answer;
              const showFeedback = selectedChoice !== null;

              let choiceStyles =
                "border-white/10 bg-black/30 hover:border-fuchsia-400/40 hover:bg-white/5";

              if (showFeedback && isCorrectChoice) {
                choiceStyles = "border-emerald-400/50 bg-emerald-500/10";
              } else if (showFeedback && isSelected && !isCorrectChoice) {
                choiceStyles = "border-red-400/50 bg-red-500/10";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelectAnswer(choice)}
                  disabled={showFeedback}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150 disabled:cursor-default sm:text-base ${choiceStyles}`}
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white/70">
                    {CHOICE_LETTERS[i]}
                  </span>
                  <span className="text-white/90">{choice}</span>
                </button>
              );
            })}
          </div>

          {/* Explanation shown after answering */}
          {selectedChoice && (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
              {currentQuestion.explanation}
            </div>
          )}

          {/* Next / Finish button */}
          {selectedChoice && (
            <button
              onClick={handleNext}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 hover:scale-[1.02] active:scale-95"
            >
              {currentIndex === questions.length - 1
                ? "Finish Battle"
                : "Next Question"}
              <svg
                className="h-5 w-5"
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