"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { trackEvent } from "@/lib/trackEvent";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/useAuth";

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

type StudyMode =
  | "battle"
  | "practice"
  | "weak_topic"
  | "review_missed"
  | "quick_check";

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

function coerceQuestion(value: unknown): Question | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.deck_id !== "string" ||
    typeof candidate.question_text !== "string" ||
    !Array.isArray(candidate.answer_choices) ||
    !candidate.answer_choices.every((choice) => typeof choice === "string") ||
    typeof candidate.correct_answer !== "string" ||
    typeof candidate.explanation !== "string" ||
    typeof candidate.topic !== "string" ||
    typeof candidate.difficulty !== "string"
  ) {
    return null;
  }

  const answerChoices = candidate.answer_choices as string[];
  if (answerChoices.length < 2) return null;

  return {
    id: candidate.id,
    deck_id: candidate.deck_id,
    question_text: candidate.question_text,
    answer_choices: answerChoices,
    correct_answer: candidate.correct_answer,
    explanation: candidate.explanation,
    topic: candidate.topic,
    difficulty: candidate.difficulty,
  };
}

const CHOICE_LETTERS = ["A", "B", "C", "D"];

// Point values for the streak bonus system.
const BASE_POINTS_PER_CORRECT = 100;
const STREAK_BONUS_TIER_1 = 25; // 3+ streak
const STREAK_BONUS_TIER_2 = 50; // 5+ streak

function calculatePointsForStreak(streak: number): number {
  if (streak >= 5) return BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_2;
  if (streak >= 3) return BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_1;
  return BASE_POINTS_PER_CORRECT;
}

function normalizeTopicKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRequestedPracticeTopics(searchParams: URLSearchParams): string[] {
  const rawTopics = searchParams.get("topics") || "";

  return rawTopics
    .split(",")
    .map((topic) => normalizeTopicKey(decodeURIComponent(topic)))
    .filter(Boolean);
}

function getStudyMode(searchParams: URLSearchParams): StudyMode {
  const rawMode = (searchParams.get("mode") || "battle").toLowerCase();
  const allowedModes: StudyMode[] = [
    "battle",
    "practice",
    "weak_topic",
    "review_missed",
    "quick_check",
  ];

  return allowedModes.includes(rawMode as StudyMode)
    ? (rawMode as StudyMode)
    : "battle";
}

function getQuestionLimit(searchParams: URLSearchParams): number | null {
  const rawLimit = searchParams.get("limit");
  if (!rawLimit) return null;

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;

  return Math.min(parsed, 50);
}

function getStudyModeLabel(mode: StudyMode): string {
  if (mode === "practice") return "Practice Mode";
  if (mode === "weak_topic") return "Weak Topic Mode";
  if (mode === "review_missed") return "Review Missed Mode";
  if (mode === "quick_check") return "Quick Check Mode";
  return "Battle Mode";
}

function getPreferredDisplayName(profile: Profile | null, user: User | null): string {
  const profileName = profile?.display_name?.trim();
  if (profileName) return profileName;

  const emailName = user?.email?.split("@")[0]?.trim();
  if (emailName) return emailName;

  return "";
}

// Rank badge labels/styles for the top 3 leaderboard spots
const RANK_BADGES: Record<number, { label: string; color: string }> = {
  0: { label: "Champion", color: "from-yellow-300 to-amber-500" },
  1: { label: "Runner Up", color: "from-slate-300 to-slate-400" },
  2: { label: "Top 3", color: "from-orange-400 to-amber-700" },
};

// Defined OUTSIDE the page component so it keeps a stable identity across
// re-renders, preventing the whole subtree from remounting on state changes.
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
  const searchParams = useSearchParams();
  const deckId = params.deckId as string;
  const challengeFromMatchId = searchParams.get("challengeFrom");
  const challengeBaseScore = searchParams.get("challengeScore");

  // Current logged-in user, if any. Battle play stays open to anyone with
  // the link (no login required) — this only tags the resulting match
  // with user_id when the player happens to be logged in.
  const { user, profile } = useAuth();

  // Loading the deck + questions
  const [deck, setDeck] = useState<Deck | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [practiceTopicsMessage, setPracticeTopicsMessage] = useState<string | null>(null);

  // Leaderboard (top 5 scores for this deck)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(true);

  // Optional name input for challengers. This is UNCONTROLLED — typing
  // updates the DOM input directly via the browser, not React state — so
  // no re-render happens per keystroke, keeping it smooth. We only read
  // the value once, when "Start Battle" is clicked.
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [playerName, setPlayerName] = useState("");
  const [isEditingPlayerName, setIsEditingPlayerName] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // Quiz progress
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  // Streak + points tracking
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [lastPointsEarned, setLastPointsEarned] = useState(0);

  // Timer (counts up in seconds while the battle is in progress)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Tracks when the current question was first shown, so we can measure
  // how long the player took to answer it (response_time_ms).
  const questionStartSecondsRef = useRef(0);

  // Guards handleNext's "finish and save" branch from running more than
  // once for the same match — e.g. a fast double-click on "Finish Battle"
  // before the UI has a chance to re-render and hide the button. This is
  // a synchronous ref check (not React state), so it takes effect
  // immediately, unlike setState which batches and could let a second
  // click slip through before the first update is reflected.
  const hasFinishedRef = useRef(false);

  // Saving the finished match
  const [isFinishing, setIsFinishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestedPracticeTopics = useMemo(
    () => getRequestedPracticeTopics(searchParams),
    [searchParams]
  );
  const requestedStudyMode = useMemo(
    () => getStudyMode(searchParams),
    [searchParams]
  );
  const requestedQuestionLimit = useMemo(
    () => getQuestionLimit(searchParams),
    [searchParams]
  );
  const effectiveStudyMode: StudyMode =
    requestedPracticeTopics.length > 0 && requestedStudyMode === "battle"
      ? "weak_topic"
      : requestedStudyMode;
  const effectiveQuestionLimit =
    effectiveStudyMode === "quick_check"
      ? 5
      : requestedQuestionLimit;
  const accountDisplayName = getPreferredDisplayName(profile, user);

  // Load the deck and its questions when the page mounts
  useEffect(() => {
    async function loadBattle() {
      setIsLoading(true);
      setLoadError(null);
      setPracticeTopicsMessage(null);
      setDeck(null);
      setQuestions([]);
      setHasStarted(false);
      setCurrentIndex(0);
      setAnswers([]);
      setSelectedChoice(null);
      setCurrentStreak(0);
      setBestStreak(0);
      setTotalScore(0);
      setLastPointsEarned(0);
      setElapsedSeconds(0);
      setSaveError(null);
      hasFinishedRef.current = false;

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

      const normalizedDeck = coerceDeck(deckData);
      if (!normalizedDeck) {
        setLoadError("This deck is missing required data and cannot be played safely.");
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

      const normalizedQuestions = (questionsData as unknown[])
        .map((question) => coerceQuestion(question))
        .filter((question): question is Question => question !== null);

      if (normalizedQuestions.length === 0) {
        setLoadError(
          "This battle is missing required question data and cannot be played safely."
        );
        setIsLoading(false);
        return;
      }

      setDeck(normalizedDeck);
      const filteredQuestions =
        requestedPracticeTopics.length > 0
          ? normalizedQuestions.filter((question) =>
              requestedPracticeTopics.some(
                (topic) => {
                  const questionTopic = normalizeTopicKey(question.topic);
                  return (
                    questionTopic === topic ||
                    questionTopic.includes(topic) ||
                    topic.includes(questionTopic)
                  );
                }
              )
            )
          : normalizedQuestions;

      if (requestedPracticeTopics.length > 0 && filteredQuestions.length === 0) {
        setPracticeTopicsMessage(
          "None of the saved questions matched those weak topics, so this battle is using the full deck instead."
        );
      }

      const baseQuestionSet =
        filteredQuestions.length > 0
          ? filteredQuestions
          : normalizedQuestions;

      const finalQuestionSet =
        effectiveQuestionLimit && baseQuestionSet.length > effectiveQuestionLimit
          ? baseQuestionSet.slice(0, effectiveQuestionLimit)
          : baseQuestionSet;

      setQuestions(finalQuestionSet);
      setIsLoading(false);
    }

    if (deckId) {
      loadBattle();
    }
  }, [deckId, requestedPracticeTopics, effectiveQuestionLimit]);

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
      } else {
        setLeaderboard([]);
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
    const typedName = nameInputRef.current?.value.trim() || "";
    const defaultBattleName = accountDisplayName || deck?.student_name || "Player";
    const finalName = typedName || defaultBattleName;

    setPlayerName(finalName);
    setHasStarted(true);
    questionStartSecondsRef.current = elapsedSeconds;

    trackEvent("battle_started", {
      deckId,
      playerName: finalName,
      totalQuestions: questions.length,
      practiceTopics: requestedPracticeTopics,
      studyMode: effectiveStudyMode,
      challengeFromMatchId,
    });
  };

  const handleSelectAnswer = (choice: string) => {
    if (selectedChoice) return; // question already answered

    const currentQuestion = questions[currentIndex];
    const isCorrect = choice === currentQuestion.correct_answer;
    const responseTimeMs = Math.max(
      0,
      (elapsedSeconds - questionStartSecondsRef.current) * 1000
    );

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

    if (isCorrect) {
      const newStreak = currentStreak + 1;
      const pointsEarned = calculatePointsForStreak(newStreak);

      setCurrentStreak(newStreak);
      setBestStreak((prevBest) => Math.max(prevBest, newStreak));
      setTotalScore((prevScore) => prevScore + pointsEarned);
      setLastPointsEarned(pointsEarned);
    } else {
      setCurrentStreak(0);
      setLastPointsEarned(0);
    }
  };

  const handleNext = useCallback(async () => {
    const isLastQuestion = currentIndex === questions.length - 1;

    if (!isLastQuestion) {
      questionStartSecondsRef.current = elapsedSeconds;
      setCurrentIndex((prev) => prev + 1);
      setSelectedChoice(null);
      return;
    }

    // This was the last question — save the finished match. Guarded so
    // this branch can only ever run once per battle, even if the button
    // is somehow clicked twice in quick succession.
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;

    setIsFinishing(true);
    setSaveError(null);

    const correctCount = answers.filter((a) => a.isCorrect).length;

    let response: Response;

    try {
      response = await fetch("/api/battle/finish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deckId,
          playerName: playerName || accountDisplayName || deck?.student_name || "Player",
          score: totalScore,
          totalQuestions: questions.length,
          correctAnswers: correctCount,
          timeTakenSeconds: elapsedSeconds,
          answers,
        }),
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "We could not save this battle right now. Please try again."
      );
      setIsFinishing(false);
      hasFinishedRef.current = false;
      return;
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      setSaveError(`Server error (status ${response.status}). Please try again.`);
      setIsFinishing(false);
      hasFinishedRef.current = false;
      return;
    }

    const result = (await response.json()) as {
      matchId?: string;
      error?: string;
    };

    if (!response.ok || !result.matchId) {
      setSaveError(result.error || "Failed to save your match.");
      setIsFinishing(false);
      hasFinishedRef.current = false;
      return;
    }

    trackEvent("battle_finished", {
      deckId,
      matchId: result.matchId,
      score: totalScore,
      correctAnswers: correctCount,
      bestStreak,
      totalQuestions: questions.length,
      timeTakenSeconds: elapsedSeconds,
    });

    const resultSearchParams = new URLSearchParams();

    if (challengeFromMatchId) {
      resultSearchParams.set("challengeFrom", challengeFromMatchId);
    }

    if (challengeBaseScore) {
      resultSearchParams.set("challengeScore", challengeBaseScore);
    }

    const resultPath = resultSearchParams.toString()
      ? `/results/${result.matchId}?${resultSearchParams.toString()}`
      : `/results/${result.matchId}`;

    router.push(resultPath);
  }, [
    currentIndex,
    questions,
    answers,
    deckId,
    deck,
    accountDisplayName,
    playerName,
    totalScore,
    bestStreak,
    elapsedSeconds,
    user,
    router,
    challengeFromMatchId,
    challengeBaseScore,
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
        {effectiveStudyMode !== "battle" && (
          <div className="mb-4 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 backdrop-blur-sm sm:mb-5">
            {getStudyModeLabel(effectiveStudyMode)}
          </div>
        )}

        {requestedPracticeTopics.length > 0 && (
          <div className="mb-4 flex max-w-full flex-wrap items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200 backdrop-blur-sm sm:mb-5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            Practice Weak Topics
            <span className="normal-case tracking-normal text-white/70">
              {requestedPracticeTopics.join(" · ")}
            </span>
          </div>
        )}

        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          BATTLE READY
        </div>

        {challengeFromMatchId && challengeBaseScore && (
          <div className="mb-4 w-full max-w-sm rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-center text-xs font-semibold text-cyan-100 backdrop-blur-sm sm:mb-5">
            Challenge mode enabled. Beat the original score of {challengeBaseScore}%.
          </div>
        )}

        {practiceTopicsMessage && (
          <div className="mb-4 w-full max-w-sm rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-center text-xs font-semibold text-amber-100 backdrop-blur-sm sm:mb-5">
            {practiceTopicsMessage}
          </div>
        )}

        <h1 className="max-w-full text-center text-3xl font-black tracking-tight break-words sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            {deck.title}
          </span>
        </h1>
        <p className="mt-2 text-center text-sm text-white/50">
          {deck.course_name} · {questions.length} questions
        </p>

        <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:mt-10 sm:p-6">
          {accountDisplayName && !isEditingPlayerName ? (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] px-4 py-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white/90">
                    Playing as {accountDisplayName}
                  </p>
                  <p className="mt-1 text-[11px] text-white/40">
                    You&apos;re already logged in, so you don&apos;t need to enter your name again.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingPlayerName(true)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/85 transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10"
                >
                  Change Name
                </button>
              </div>
            </div>
          ) : (
            <>
              <label
                htmlFor="challengerName"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Playing As {accountDisplayName ? "(optional override)" : "(optional)"}
              </label>
              <input
                id="challengerName"
                ref={nameInputRef}
                type="text"
                defaultValue={accountDisplayName || ""}
                placeholder={accountDisplayName || deck.student_name}
                autoFocus={isEditingPlayerName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleStart();
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 sm:text-sm"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-white/30">
                <span>
                  {accountDisplayName
                    ? "Change it only if you want a different name on this battle result."
                    : `Leave blank to play as ${deck.student_name}`}
                </span>
                {accountDisplayName && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPlayerName(false)}
                    className="font-bold text-cyan-300 transition-colors duration-150 hover:text-cyan-200"
                  >
                    Keep account name
                  </button>
                )}
              </div>
            </>
          )}

          <button
            onClick={handleStart}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
          >
            Start Battle
          </button>
        </div>

        {/* Scoring rules reminder */}
        <div className="mt-4 w-full max-w-sm rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-center">
          <p className="text-[11px] text-white/40">
            🔥 100 pts per correct · +25 bonus at a 3-streak · +50 bonus at a
            5-streak
          </p>
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
  const bonusForCurrentStreak =
    currentStreak >= 5
      ? STREAK_BONUS_TIER_2
      : currentStreak >= 3
      ? STREAK_BONUS_TIER_1
      : 0;

  return (
    <Background>
      <div className="w-full max-w-2xl">
        {/* Top bar: progress + timer */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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

        {/* Score + streak bar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 sm:mb-6">
          <div className="flex items-center gap-1.5 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1">
            <span className="text-sm font-black text-fuchsia-300">
              {totalScore}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/70">
              pts
            </span>
          </div>

          <div className="flex items-center gap-2">
            {bestStreak > 0 && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Best: {bestStreak}
              </span>
            )}
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 transition-colors duration-200 ${
                currentStreak >= 5
                  ? "border-orange-400/40 bg-orange-500/15"
                  : currentStreak >= 3
                  ? "border-amber-400/30 bg-amber-500/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <span className="text-sm leading-none">
                {currentStreak >= 3 ? "🔥" : "⚡"}
              </span>
              <span
                className={`text-sm font-bold ${
                  currentStreak >= 5
                    ? "text-orange-300"
                    : currentStreak >= 3
                    ? "text-amber-300"
                    : "text-white/60"
                }`}
              >
                {currentStreak} streak
              </span>
              {bonusForCurrentStreak > 0 && (
                <span className="text-[10px] font-bold text-white/40">
                  (+{bonusForCurrentStreak})
                </span>
              )}
            </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className={`text-xs font-bold uppercase tracking-wider ${
                    answeredCorrectly ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {answeredCorrectly ? "Correct!" : "Not quite"}
                </p>

                {answeredCorrectly && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                    +{lastPointsEarned} pts
                    {lastPointsEarned > BASE_POINTS_PER_CORRECT && (
                      <span className="text-orange-300">
                        🔥 streak bonus
                      </span>
                    )}
                  </span>
                )}
              </div>

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

          {saveError && (
            <div className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200/90">
              {saveError}
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