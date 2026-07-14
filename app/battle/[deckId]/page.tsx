"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import VyraCoach from "@/app/components/VyraCoach";
import ConfettiBurst from "@/app/components/ConfettiBurst";
import { OpponentFace, moodFromStreak } from "@/app/components/OpponentFace";
import { UI_Z_INDEX } from "@/lib/uiLayout";
import { useVoiceStudyMode } from "@/lib/useVoiceStudyMode";
import { motion } from "framer-motion";
import { pressable, springBouncy, springSnappy } from "@/lib/motion";
import { useCountUp } from "@/lib/useCountUp";
import {
  calculateLevel,
  getGoalProgress,
  getNextMilestoneXp,
  getProgressStorageKey,
  getRankInfo,
  getSeasonProgress,
  loadProgressSnapshot,
  type BattleHistoryEntry,
} from "@/lib/playerProgress";
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
  question_type?: string;
  rubric_points?: string[] | null;
  reasoning_format?: string | null;
};

type OpenResponseGrade = {
  score: number;
  pointsAddressed: string[];
  pointsMissed: string[];
  feedback: string;
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

type FinishedSummary = {
  correctCount: number;
  totalQuestions: number;
  totalScore: number;
  bestStreak: number;
  elapsedSeconds: number;
  topicBreakdown: Array<{ topic: string; missed: number; total: number }>;
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
  | "quick_check"
  | "boss"
  | "rival";

type TopicAccuracyStat = {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
};

type BossReadiness = {
  unlocked: boolean;
  bossName: string;
  requiredScore: number;
  requiredAccuracy: number;
  weakTopics: string[];
  strongTopics: string[];
  practiceAdvice: string;
  attempts: number;
  nextRecommendedBoss: string;
};

type RivalRank = "Rookie" | "Grinder" | "Scholar" | "Genius" | "Legend";

type RivalTier = {
  rank: RivalRank;
  rivalName: string;
  accuracyFloor: number;
  accuracyCeil: number;
  baseResponseMs: number;
  responseVarianceMs: number;
  unlockMinBattles: number;
  unlockMinAccuracy: number;
};

type RivalReadiness = {
  rivalName: string;
  rank: RivalRank;
  targetAccuracy: number;
  expectedResponseMs: number;
  weakTopics: string[];
  strongTopics: string[];
  playerAverageAccuracy: number;
  attempts: number;
  unlockedRanks: RivalRank[];
  nextUnlock: {
    rank: RivalRank;
    requirement: string;
  } | null;
  rivalStrengths: string[];
  playerNeedsImprovement: string[];
};

type EngagementPreview = {
  level: number;
  rankLabel: string;
  currentStreakDays: number;
  dailyBattles: number;
  weeklyBattles: number;
  seasonProgressPercent: number;
  seasonLabel: string;
  nextMilestoneXp: number | null;
  recentHistory: BattleHistoryEntry[];
};

const RIVAL_TIERS: RivalTier[] = [
  {
    rank: "Rookie",
    rivalName: "Rex Rookie",
    accuracyFloor: 52,
    accuracyCeil: 68,
    baseResponseMs: 8200,
    responseVarianceMs: 2200,
    unlockMinBattles: 0,
    unlockMinAccuracy: 0,
  },
  {
    rank: "Grinder",
    rivalName: "Gia Grinder",
    accuracyFloor: 62,
    accuracyCeil: 76,
    baseResponseMs: 7100,
    responseVarianceMs: 1700,
    unlockMinBattles: 3,
    unlockMinAccuracy: 55,
  },
  {
    rank: "Scholar",
    rivalName: "Soren Scholar",
    accuracyFloor: 70,
    accuracyCeil: 84,
    baseResponseMs: 5900,
    responseVarianceMs: 1300,
    unlockMinBattles: 6,
    unlockMinAccuracy: 66,
  },
  {
    rank: "Genius",
    rivalName: "Gwen Genius",
    accuracyFloor: 78,
    accuracyCeil: 92,
    baseResponseMs: 4900,
    responseVarianceMs: 1000,
    unlockMinBattles: 10,
    unlockMinAccuracy: 78,
  },
  {
    rank: "Legend",
    rivalName: "Lux Legend",
    accuracyFloor: 86,
    accuracyCeil: 97,
    baseResponseMs: 3800,
    responseVarianceMs: 800,
    unlockMinBattles: 15,
    unlockMinAccuracy: 88,
  },
];

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

function normalizeTopicLabel(input: string): string {
  const trimmed = (input || "General").trim();
  return trimmed || "General";
}

function shuffleArray<T>(items: T[]): T[] {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = clone[i];
    clone[i] = clone[j];
    clone[j] = temp;
  }
  return clone;
}

function buildTopicAccuracyStats(args: {
  answers: AnswerRecord[];
  questionById: Map<string, Question>;
}): TopicAccuracyStat[] {
  const { answers, questionById } = args;
  const topicMap = new Map<string, { correct: number; total: number }>();

  for (const answer of answers) {
    const question = questionById.get(answer.questionId);
    if (!question) continue;

    const topic = normalizeTopicLabel(question.topic);
    const bucket = topicMap.get(topic) || { correct: 0, total: 0 };
    bucket.total += 1;
    if (answer.isCorrect) bucket.correct += 1;
    topicMap.set(topic, bucket);
  }

  return Array.from(topicMap.entries()).map(([topic, values]) => ({
    topic,
    correct: values.correct,
    total: values.total,
    accuracy: values.total > 0 ? Math.round((values.correct / values.total) * 100) : 0,
  }));
}

function pickQuestionsByTopic(topics: string[], questions: Question[], count: number): Question[] {
  if (topics.length === 0 || count <= 0) return [];

  const normalizedTopics = topics.map((topic) => normalizeTopicKey(topic));
  const pool = questions.filter((question) => {
    const questionTopic = normalizeTopicKey(question.topic);
    return normalizedTopics.some(
      (topic) =>
        questionTopic === topic ||
        questionTopic.includes(topic) ||
        topic.includes(questionTopic)
    );
  });

  return shuffleArray(pool).slice(0, count);
}

function buildBossQuestionSet(args: {
  questions: Question[];
  weakTopics: string[];
  strongTopics: string[];
  limit: number;
}): Question[] {
  const { questions, weakTopics, strongTopics, limit } = args;

  const weakQuestions = pickQuestionsByTopic(weakTopics, questions, Math.ceil(limit * 0.45));
  const strongQuestions = pickQuestionsByTopic(strongTopics, questions, Math.ceil(limit * 0.3));
  const challengeQuestions = shuffleArray(
    questions.filter((question) => question.difficulty.toLowerCase() === "hard")
  ).slice(0, Math.ceil(limit * 0.35));

  const selected = new Map<string, Question>();
  for (const question of [...weakQuestions, ...strongQuestions, ...challengeQuestions]) {
    selected.set(question.id, question);
  }

  if (selected.size < limit) {
    for (const question of shuffleArray(questions)) {
      selected.set(question.id, question);
      if (selected.size >= limit) break;
    }
  }

  return Array.from(selected.values()).slice(0, limit);
}

function buildRivalQuestionSet(args: {
  questions: Question[];
  weakTopics: string[];
  strongTopics: string[];
  limit: number;
}): Question[] {
  const { questions, weakTopics, strongTopics, limit } = args;

  const weakQuestions = pickQuestionsByTopic(weakTopics, questions, Math.ceil(limit * 0.6));
  const strongQuestions = pickQuestionsByTopic(strongTopics, questions, Math.ceil(limit * 0.2));
  const challengeQuestions = shuffleArray(
    questions.filter((question) => question.difficulty.toLowerCase() !== "easy")
  ).slice(0, Math.ceil(limit * 0.2));

  const selected = new Map<string, Question>();
  for (const question of [...weakQuestions, ...strongQuestions, ...challengeQuestions]) {
    selected.set(question.id, question);
  }

  if (selected.size < limit) {
    for (const question of shuffleArray(questions)) {
      selected.set(question.id, question);
      if (selected.size >= limit) break;
    }
  }

  return Array.from(selected.values()).slice(0, limit);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Maps a spoken transcript ("B", "option B", "the second one", or the
// choice's own text read back) to one of a question's answer_choices.
// No AI call needed here -- unlike open_response grading, matching a fixed
// set of choices is a closed problem simple heuristics handle well.
function matchSpokenChoice(transcript: string, choices: string[]): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const spoken = normalize(transcript);
  if (!spoken) return null;

  const letterMatch = spoken.match(/\b([a-e])\b/);
  const letterIndex = letterMatch ? letterMatch[1].charCodeAt(0) - "a".charCodeAt(0) : -1;
  if (letterIndex >= 0 && choices[letterIndex]) return choices[letterIndex];

  const ordinalWords = ["first", "second", "third", "fourth", "fifth"];
  const ordinalIndex = ordinalWords.findIndex((word) => spoken.includes(word));
  if (ordinalIndex !== -1 && choices[ordinalIndex]) return choices[ordinalIndex];

  const exactMatch = choices.find((choice) => normalize(choice) === spoken);
  if (exactMatch) return exactMatch;

  const substringMatch = choices.find(
    (choice) => spoken.includes(normalize(choice)) || normalize(choice).includes(spoken)
  );
  if (substringMatch) return substringMatch;

  const spokenWords = new Set(spoken.split(" ").filter(Boolean));
  let best: { choice: string; overlap: number } | null = null;
  for (const choice of choices) {
    const overlap = normalize(choice)
      .split(" ")
      .filter((word) => word && spokenWords.has(word)).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { choice, overlap };
  }
  return best?.choice || null;
}

function parseRivalRank(input: string | null): RivalRank | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  const found = RIVAL_TIERS.find((tier) => tier.rank.toLowerCase() === normalized);
  return found ? found.rank : null;
}

function seededUnitInterval(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000003;
  }

  const value = Math.sin(hash) * 10000;
  return value - Math.floor(value);
}

function getRequestedPracticeTopics(searchParams: URLSearchParams): string[] {
  const rawTopics = searchParams.get("topics") || "";

  return rawTopics
    .split(",")
    .map((topic) => normalizeTopicKey(decodeURIComponent(topic)))
    .filter(Boolean);
}

// Exact-question selection (question_review_schedule-driven rematch links
// from Mastery Map) takes precedence over the fuzzy topics= matching above
// when present -- it targets the specific questions a student is actually
// missing/due, not "anything tagged with this topic label."
function getRequestedQuestionIds(searchParams: URLSearchParams): string[] {
  const rawIds = searchParams.get("questionIds") || "";

  return rawIds
    .split(",")
    .map((id) => decodeURIComponent(id).trim())
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
    "boss",
    "rival",
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
  if (mode === "boss") return "Boss Battle";
  if (mode === "rival") return "Study Rival Mode";
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
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
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
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-10 pb-28 sm:px-6 sm:py-14 sm:pb-24 xl:pb-14">
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
  const ghostMatchId = searchParams.get("ghostMatchId");
  const requestedRivalRank = parseRivalRank(searchParams.get("rivalRank"));

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
  const [introCountdown, setIntroCountdown] = useState<number | null>(null);
  const [showRewardBurst, setShowRewardBurst] = useState(false);
  const [wrongShake, setWrongShake] = useState(false);
  const [engagementPreview, setEngagementPreview] =
    useState<EngagementPreview | null>(null);
  const rewardBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongShakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quiz progress
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  // open_response answers are graded async (LLM rubric check), so
  // correctness can't be derived from `selectedChoice === correct_answer`
  // the way MC/TF can -- this holds the result of that grading call once it
  // resolves, for both formats.
  const [lastAnswerWasCorrect, setLastAnswerWasCorrect] = useState<boolean | null>(null);
  const [openResponseDraft, setOpenResponseDraft] = useState("");
  const [isGradingOpenResponse, setIsGradingOpenResponse] = useState(false);

  // Hands-free voice study: VYRA reads the question aloud, then listens for
  // a spoken answer -- lets a student practice while walking/driving
  // instead of only reading and typing. Gated behind isSupported since
  // Firefox has no SpeechRecognition.
  const voice = useVoiceStudyMode();
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const voicePromptedQuestionIdRef = useRef<string | null>(null);
  const [openResponseError, setOpenResponseError] = useState<string | null>(null);
  const [openResponseFeedback, setOpenResponseFeedback] = useState<OpenResponseGrade | null>(null);

  // Streak + points tracking
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const displayedScore = useCountUp(totalScore);
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
  // Everything needed to render the finished-battle summary is already
  // known client-side (answers, score, streak) the instant the last
  // question resolves -- computed and shown immediately so the student
  // isn't staring at a bare spinner for the /api/battle/finish round-trip.
  // The real save still runs in the background; only the matchId-dependent
  // navigation to /results/[matchId] waits on it.
  const [finishedSummary, setFinishedSummary] = useState<FinishedSummary | null>(null);
  const [bossReadiness, setBossReadiness] = useState<BossReadiness | null>(null);
  const [isBossLoading, setIsBossLoading] = useState(false);
  const [rivalReadiness, setRivalReadiness] = useState<RivalReadiness | null>(null);
  const [isGhostRival, setIsGhostRival] = useState(false);
  const [ghostAnswerByQuestion, setGhostAnswerByQuestion] = useState<
    Record<
      string,
      { selectedAnswer: string; isCorrect: boolean; responseTimeMs: number }
    >
  >({});
  const [rivalAnswers, setRivalAnswers] = useState<AnswerRecord[]>([]);
  const [rivalCurrentStreak, setRivalCurrentStreak] = useState(0);
  const [rivalBestStreak, setRivalBestStreak] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [isRivalResolving, setIsRivalResolving] = useState(false);
  const rivalResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedPracticeTopics = useMemo(
    () => getRequestedPracticeTopics(searchParams),
    [searchParams]
  );
  const requestedQuestionIds = useMemo(
    () => getRequestedQuestionIds(searchParams),
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
    requestedStudyMode !== "battle"
      ? requestedStudyMode
      : requestedQuestionIds.length > 0
        ? "review_missed"
        : requestedPracticeTopics.length > 0
          ? "weak_topic"
          : requestedStudyMode;
  const effectiveQuestionLimit =
    effectiveStudyMode === "quick_check"
      ? 5
      : effectiveStudyMode === "boss"
        ? 12
      : effectiveStudyMode === "rival"
        ? 10
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
      setIntroCountdown(null);
      setShowRewardBurst(false);
      setEngagementPreview(null);
      setCurrentIndex(0);
      setAnswers([]);
      setSelectedChoice(null);
      setLastAnswerWasCorrect(null);
      setOpenResponseDraft("");
      setOpenResponseFeedback(null);
      setOpenResponseError(null);
      setCurrentStreak(0);
      setBestStreak(0);
      setTotalScore(0);
      setLastPointsEarned(0);
      setElapsedSeconds(0);
      setSaveError(null);
      setBossReadiness(null);
      setIsBossLoading(false);
      setRivalReadiness(null);
      setIsGhostRival(false);
      setGhostAnswerByQuestion({});
      setRivalAnswers([]);
      setRivalCurrentStreak(0);
      setRivalBestStreak(0);
      setRivalScore(0);
      setIsRivalResolving(false);
      if (rivalResolveTimerRef.current) {
        clearTimeout(rivalResolveTimerRef.current);
        rivalResolveTimerRef.current = null;
      }
      if (rewardBurstTimerRef.current) {
        clearTimeout(rewardBurstTimerRef.current);
        rewardBurstTimerRef.current = null;
      }
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

      if (effectiveStudyMode === "boss") {
        setIsBossLoading(true);

        const playerIdentity =
          accountDisplayName || normalizedDeck.student_name || "Player";

        const { data: previousMatches } = await supabase
          .from("matches")
          .select("id")
          .eq("deck_id", deckId)
          .eq("player_name", playerIdentity)
          .order("created_at", { ascending: false })
          .limit(40);

        const previousMatchIds = (previousMatches || []).map((entry) => entry.id);
        const attempts = previousMatchIds.length;
        const requiredAccuracy = 70;
        const requiredScore = Math.round((effectiveQuestionLimit || 12) * 95);

        let topicStats: TopicAccuracyStat[] = [];

        if (previousMatchIds.length > 0) {
          const { data: previousAnswers } = await supabase
            .from("match_answers")
            .select("question_id, selected_answer, is_correct, response_time_ms")
            .in("match_id", previousMatchIds);

          const questionById = new Map(
            normalizedQuestions.map((question) => [question.id, question])
          );

          const normalizedAnswers: AnswerRecord[] = (previousAnswers || [])
            .map((answer) => {
              const question = questionById.get(answer.question_id);
              if (!question) return null;

              return {
                questionId: answer.question_id,
                selectedAnswer: answer.selected_answer,
                isCorrect: !!answer.is_correct,
                responseTimeMs: Number(answer.response_time_ms || 0),
              };
            })
            .filter((answer): answer is AnswerRecord => answer !== null);

          topicStats = buildTopicAccuracyStats({
            answers: normalizedAnswers,
            questionById,
          });
        }

        const weakTopics = topicStats
          .filter((topic) => topic.total >= 2 && topic.accuracy < requiredAccuracy)
          .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
          .map((topic) => topic.topic)
          .slice(0, 4);

        const strongTopics = topicStats
          .filter((topic) => topic.total >= 2 && topic.accuracy >= 80)
          .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)
          .map((topic) => topic.topic)
          .slice(0, 4);

        const bossFocusTopic = weakTopics[0] || normalizedDeck.course_name || "Core Concepts";
        const nextRecommendedBoss =
          weakTopics[1] || strongTopics[0] || normalizedDeck.course_name || "Mastery";

        const unlocked = attempts >= 3 && weakTopics.length > 0;

        const practiceAdvice = !unlocked
          ? attempts < 3
            ? "Complete at least 3 regular battles on this deck to unlock the boss."
            : "Missed-topic practice is too shallow. Run a weak-topic rematch first."
          : "Boss unlocked. Focus on pace and precision: weak topics first, then challenge questions.";

        const bossMeta: BossReadiness = {
          unlocked,
          bossName: `${normalizedDeck.course_name} Boss: ${bossFocusTopic}`,
          requiredScore,
          requiredAccuracy,
          weakTopics,
          strongTopics,
          practiceAdvice,
          attempts,
          nextRecommendedBoss: `${normalizedDeck.course_name} Boss: ${nextRecommendedBoss}`,
        };

        setBossReadiness(bossMeta);

        const bossQuestionSet = buildBossQuestionSet({
          questions: normalizedQuestions,
          weakTopics,
          strongTopics,
          limit: effectiveQuestionLimit || 12,
        });

        setQuestions(
          bossQuestionSet.length > 0
            ? bossQuestionSet
            : normalizedQuestions.slice(0, effectiveQuestionLimit || 12)
        );
        setIsBossLoading(false);
        setIsLoading(false);
        return;
      }

      if (effectiveStudyMode === "rival") {
        let ghostProfile: {
          id: string;
          playerName: string;
          targetAccuracy: number;
          expectedResponseMs: number;
        } | null = null;

        if (ghostMatchId) {
          const { data: ghostMatch } = await supabase
            .from("matches")
            .select(
              "id, player_name, correct_answers, total_questions, time_taken_seconds"
            )
            .eq("id", ghostMatchId)
            .eq("deck_id", deckId)
            .maybeSingle();

          if (ghostMatch) {
            const { data: ghostAnswers } = await supabase
              .from("match_answers")
              .select("question_id, selected_answer, is_correct, response_time_ms")
              .eq("match_id", ghostMatch.id);

            if (ghostAnswers && ghostAnswers.length > 0) {
              const ghostAnswerMap = ghostAnswers.reduce<
                Record<
                  string,
                  { selectedAnswer: string; isCorrect: boolean; responseTimeMs: number }
                >
              >((acc, entry) => {
                acc[entry.question_id] = {
                  selectedAnswer: entry.selected_answer,
                  isCorrect: !!entry.is_correct,
                  responseTimeMs: Number(entry.response_time_ms || 0),
                };
                return acc;
              }, {});

              const ghostAccuracy =
                Number(ghostMatch.total_questions || 0) > 0
                  ? Math.round(
                      (Number(ghostMatch.correct_answers || 0) /
                        Number(ghostMatch.total_questions || 0)) *
                        100
                    )
                  : 0;

              const ghostExpectedResponse =
                Number(ghostMatch.total_questions || 0) > 0
                  ? Math.round(
                      (Number(ghostMatch.time_taken_seconds || 0) * 1000) /
                        Number(ghostMatch.total_questions || 1)
                    )
                  : 5000;

              setGhostAnswerByQuestion(ghostAnswerMap);
              setIsGhostRival(true);
              ghostProfile = {
                id: ghostMatch.id,
                playerName: ghostMatch.player_name,
                targetAccuracy: clampNumber(ghostAccuracy, 20, 99),
                expectedResponseMs: clampNumber(ghostExpectedResponse, 1200, 15000),
              };
            }
          }
        }

        const playerIdentity =
          accountDisplayName || normalizedDeck.student_name || "Player";

        const { data: previousMatches } = await supabase
          .from("matches")
          .select("id, correct_answers, total_questions")
          .eq("deck_id", deckId)
          .eq("player_name", playerIdentity)
          .order("created_at", { ascending: false })
          .limit(60);

        const previousMatchIds = (previousMatches || []).map((entry) => entry.id);
        const attempts = previousMatchIds.length;

        let topicStats: TopicAccuracyStat[] = [];
        let playerAverageAccuracy = 0;

        if ((previousMatches || []).length > 0) {
          const totalCorrect = (previousMatches || []).reduce(
            (sum, matchEntry) => sum + Number(matchEntry.correct_answers || 0),
            0
          );
          const totalQuestions = (previousMatches || []).reduce(
            (sum, matchEntry) => sum + Number(matchEntry.total_questions || 0),
            0
          );
          playerAverageAccuracy =
            totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
        }

        if (previousMatchIds.length > 0) {
          const { data: previousAnswers } = await supabase
            .from("match_answers")
            .select("question_id, selected_answer, is_correct, response_time_ms")
            .in("match_id", previousMatchIds);

          const questionById = new Map(
            normalizedQuestions.map((question) => [question.id, question])
          );

          const normalizedAnswers: AnswerRecord[] = (previousAnswers || [])
            .map((answer) => {
              const question = questionById.get(answer.question_id);
              if (!question) return null;

              return {
                questionId: answer.question_id,
                selectedAnswer: answer.selected_answer,
                isCorrect: !!answer.is_correct,
                responseTimeMs: Number(answer.response_time_ms || 0),
              };
            })
            .filter((answer): answer is AnswerRecord => answer !== null);

          topicStats = buildTopicAccuracyStats({
            answers: normalizedAnswers,
            questionById,
          });
        }

        const weakTopics = topicStats
          .filter((topic) => topic.total >= 2)
          .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
          .map((topic) => topic.topic)
          .slice(0, 5);

        const strongTopics = topicStats
          .filter((topic) => topic.total >= 2)
          .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)
          .map((topic) => topic.topic)
          .slice(0, 5);

        const unlockedRanks = RIVAL_TIERS.filter(
          (tier) =>
            attempts >= tier.unlockMinBattles &&
            playerAverageAccuracy >= tier.unlockMinAccuracy
        ).map((tier) => tier.rank);

        if (!unlockedRanks.includes("Rookie")) {
          unlockedRanks.push("Rookie");
        }

        const highestUnlockedRank =
          RIVAL_TIERS
            .slice()
            .reverse()
            .find((tier) => unlockedRanks.includes(tier.rank))?.rank || "Rookie";

        const selectedRank =
          requestedRivalRank && unlockedRanks.includes(requestedRivalRank)
            ? requestedRivalRank
            : highestUnlockedRank;

        const selectedTier =
          RIVAL_TIERS.find((tier) => tier.rank === selectedRank) || RIVAL_TIERS[0];

        const nextUnlockTier = RIVAL_TIERS.find(
          (tier) => !unlockedRanks.includes(tier.rank)
        );

        const targetAccuracy = clampNumber(
          Math.round(playerAverageAccuracy * 0.55 + selectedTier.accuracyFloor * 0.45),
          selectedTier.accuracyFloor,
          selectedTier.accuracyCeil
        );

        const expectedResponseMs = clampNumber(
          Math.round(selectedTier.baseResponseMs - (playerAverageAccuracy - 50) * 22),
          2200,
          selectedTier.baseResponseMs + selectedTier.responseVarianceMs
        );

        const rivalStrengths = [
          ...(strongTopics.slice(0, 2).map((topic) => `${topic} precision`)),
          "Fast answer pacing",
        ].slice(0, 3);

        const playerNeedsImprovement =
          weakTopics.length > 0
            ? weakTopics.slice(0, 3)
            : ["Consistency", "Hard-question accuracy"];

        setRivalReadiness({
          rivalName: ghostProfile?.playerName || selectedTier.rivalName,
          rank: ghostProfile ? "Legend" : selectedTier.rank,
          targetAccuracy: ghostProfile?.targetAccuracy || targetAccuracy,
          expectedResponseMs: ghostProfile?.expectedResponseMs || expectedResponseMs,
          weakTopics,
          strongTopics,
          playerAverageAccuracy,
          attempts,
          unlockedRanks,
          nextUnlock: nextUnlockTier
            ? {
                rank: nextUnlockTier.rank,
                requirement: `${nextUnlockTier.unlockMinBattles}+ battles and ${nextUnlockTier.unlockMinAccuracy}% average accuracy`,
              }
            : null,
          rivalStrengths,
          playerNeedsImprovement,
        });

        const rivalQuestions = buildRivalQuestionSet({
          questions: normalizedQuestions,
          weakTopics,
          strongTopics,
          limit: effectiveQuestionLimit || 10,
        });

        setQuestions(
          rivalQuestions.length > 0
            ? rivalQuestions
            : normalizedQuestions.slice(0, effectiveQuestionLimit || 10)
        );
        setIsLoading(false);
        return;
      }

      const filteredQuestions =
        requestedQuestionIds.length > 0
          ? normalizedQuestions.filter((question) =>
              requestedQuestionIds.includes(question.id)
            )
          : requestedPracticeTopics.length > 0
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

      if (requestedQuestionIds.length > 0 && filteredQuestions.length === 0) {
        setPracticeTopicsMessage(
          "Those review questions are no longer available, so this battle is using the full deck instead."
        );
      } else if (requestedPracticeTopics.length > 0 && filteredQuestions.length === 0) {
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
  }, [
    deckId,
    requestedPracticeTopics,
    requestedQuestionIds,
    effectiveQuestionLimit,
    effectiveStudyMode,
    accountDisplayName,
    requestedRivalRank,
    ghostMatchId,
  ]);

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
    if (!hasStarted || isFinishing || introCountdown !== null) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasStarted, isFinishing, introCountdown]);

  useEffect(() => {
    return () => {
      if (rivalResolveTimerRef.current) {
        clearTimeout(rivalResolveTimerRef.current);
      }
      if (rewardBurstTimerRef.current) {
        clearTimeout(rewardBurstTimerRef.current);
      }
      if (wrongShakeTimerRef.current) {
        clearTimeout(wrongShakeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!deck) return;

    const storageKey = getProgressStorageKey({
      userId: user?.id ?? null,
      playerName: accountDisplayName || deck.student_name,
    });
    const snapshot = loadProgressSnapshot(storageKey);
    const goals = getGoalProgress(snapshot);
    const levelInfo = calculateLevel(snapshot.totalXp);
    const rankInfo = getRankInfo(snapshot.totalXp, snapshot.bestStreakDays);
    const seasonInfo = getSeasonProgress(snapshot.totalXp);
    const nextMilestoneXp = getNextMilestoneXp(snapshot.totalXp);

    setEngagementPreview({
      level: levelInfo.level,
      rankLabel: rankInfo.label,
      currentStreakDays: snapshot.currentStreakDays,
      dailyBattles: goals.dailyBattles,
      weeklyBattles: goals.weeklyBattles,
      seasonProgressPercent: seasonInfo.progressPercent,
      seasonLabel: `Season ${seasonInfo.seasonNumber}`,
      nextMilestoneXp,
      recentHistory: snapshot.battleHistory.slice(0, 4),
    });
  }, [deck, user?.id, accountDisplayName]);

  useEffect(() => {
    if (!hasStarted || introCountdown === null) return;

    if (introCountdown <= 0) {
      setIntroCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setIntroCountdown((prev) => (prev === null ? null : prev - 1));
    }, 760);

    return () => clearTimeout(timer);
  }, [hasStarted, introCountdown]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleStart = () => {
    const typedName = nameInputRef.current?.value.trim() || "";
    const defaultBattleName = accountDisplayName || deck?.student_name || "Player";
    const finalName = typedName || defaultBattleName;

    if (effectiveStudyMode === "boss" && bossReadiness && !bossReadiness.unlocked) {
      return;
    }

    setPlayerName(finalName);
    setHasStarted(true);
    setIntroCountdown(3);
    questionStartSecondsRef.current = elapsedSeconds;

    trackEvent("battle_started", {
      deckId,
      playerName: finalName,
      totalQuestions: questions.length,
      practiceTopics: requestedPracticeTopics,
      studyMode: effectiveStudyMode,
      bossName: bossReadiness?.bossName,
      rivalName: rivalReadiness?.rivalName,
      rivalRank: rivalReadiness?.rank,
      challengeFromMatchId,
      ghostMatchId,
    });
  };

  // Shared between handleSelectAnswer (instant MC/TF correctness) and
  // handleSubmitOpenResponse (correctness known only after an async grading
  // call resolves) -- streak/score/confetti/shake all react the same way to
  // "this answer was right or wrong" regardless of how that was determined.
  const applyAnswerOutcome = (isCorrect: boolean) => {
    if (isCorrect) {
      const newStreak = currentStreak + 1;
      const pointsEarned = calculatePointsForStreak(newStreak);

      setCurrentStreak(newStreak);
      setBestStreak((prevBest) => Math.max(prevBest, newStreak));
      setTotalScore((prevScore) => prevScore + pointsEarned);
      setLastPointsEarned(pointsEarned);

      if (newStreak >= 3) {
        setShowRewardBurst(true);
        if (rewardBurstTimerRef.current) {
          clearTimeout(rewardBurstTimerRef.current);
        }
        rewardBurstTimerRef.current = setTimeout(() => {
          setShowRewardBurst(false);
          rewardBurstTimerRef.current = null;
        }, 980);
      }
    } else {
      setCurrentStreak(0);
      setLastPointsEarned(0);
      setWrongShake(true);
      if (wrongShakeTimerRef.current) {
        clearTimeout(wrongShakeTimerRef.current);
      }
      wrongShakeTimerRef.current = setTimeout(() => {
        setWrongShake(false);
        wrongShakeTimerRef.current = null;
      }, 420);
    }
  };

  const handleSelectAnswer = (choice: string) => {
    if (selectedChoice || introCountdown !== null) return; // question already answered

    const currentQuestion = questions[currentIndex];
    const isCorrect = choice === currentQuestion.correct_answer;
    const responseTimeMs = Math.max(
      0,
      (elapsedSeconds - questionStartSecondsRef.current) * 1000
    );

    setSelectedChoice(choice);
    setLastAnswerWasCorrect(isCorrect);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        selectedAnswer: choice,
        isCorrect,
        responseTimeMs,
      },
    ]);

    applyAnswerOutcome(isCorrect);

    // Rival mode simulates a ghost/bot opponent picking one of
    // answer_choices -- open_response questions have none, and rival
    // battles against free-text grading aren't a meaningful mode, so this
    // is skipped entirely for that format rather than trying to make the
    // bot "answer" a rubric-graded prompt.
    if (
      effectiveStudyMode !== "rival" ||
      !rivalReadiness ||
      currentQuestion.question_type === "open_response"
    ) {
      return;
    }

    if (isGhostRival) {
      const ghostAnswer = ghostAnswerByQuestion[currentQuestion.id];
      if (!ghostAnswer) {
        return;
      }

      setIsRivalResolving(true);
      if (rivalResolveTimerRef.current) {
        clearTimeout(rivalResolveTimerRef.current);
        rivalResolveTimerRef.current = null;
      }

      const revealDelay = Math.round(
        clampNumber(ghostAnswer.responseTimeMs * 0.35, 500, 2600)
      );

      rivalResolveTimerRef.current = setTimeout(() => {
        setRivalAnswers((prev) => [
          ...prev,
          {
            questionId: currentQuestion.id,
            selectedAnswer: ghostAnswer.selectedAnswer,
            isCorrect: ghostAnswer.isCorrect,
            responseTimeMs: ghostAnswer.responseTimeMs,
          },
        ]);

        if (ghostAnswer.isCorrect) {
          setRivalCurrentStreak((prevStreak) => {
            const nextStreak = prevStreak + 1;
            const points = calculatePointsForStreak(nextStreak);
            setRivalScore((prevScore) => prevScore + points);
            setRivalBestStreak((prevBest) => Math.max(prevBest, nextStreak));
            return nextStreak;
          });
        } else {
          setRivalCurrentStreak(0);
        }

        setIsRivalResolving(false);
        rivalResolveTimerRef.current = null;
      }, revealDelay);

      return;
    }

    setIsRivalResolving(true);
    if (rivalResolveTimerRef.current) {
      clearTimeout(rivalResolveTimerRef.current);
      rivalResolveTimerRef.current = null;
    }

    const difficulty = currentQuestion.difficulty.toLowerCase();
    const topicKey = normalizeTopicKey(currentQuestion.topic);
    const baseChance = rivalReadiness.targetAccuracy / 100;
    const difficultyDelta =
      difficulty === "hard" ? -0.1 : difficulty === "easy" ? 0.08 : 0;
    const weakTopicBoost = rivalReadiness.weakTopics.some(
      (topic) => normalizeTopicKey(topic) === topicKey
    )
      ? 0.06
      : 0;
    const strongTopicBoost = rivalReadiness.strongTopics.some(
      (topic) => normalizeTopicKey(topic) === topicKey
    )
      ? 0.04
      : 0;
    const rivalCorrectChance = clampNumber(
      baseChance + difficultyDelta + weakTopicBoost + strongTopicBoost,
      0.2,
      0.98
    );

    const jitterSeed = `${currentQuestion.id}:jitter:${answers.length}:${elapsedSeconds}`;
    const responseJitter =
      (seededUnitInterval(jitterSeed) - 0.5) * 2 * (rivalReadiness.expectedResponseMs * 0.2);
    const rivalResponseTimeMs = Math.round(
      clampNumber(
        rivalReadiness.expectedResponseMs + responseJitter,
        1800,
        rivalReadiness.expectedResponseMs * 1.7
      )
    );
    const revealDelay = Math.round(
      clampNumber(rivalResponseTimeMs * 0.35, 600, 2800)
    );

    rivalResolveTimerRef.current = setTimeout(() => {
      const correctnessSeed = `${currentQuestion.id}:correct:${answers.length}:${totalScore}`;
      const rivalIsCorrect = seededUnitInterval(correctnessSeed) < rivalCorrectChance;
      const wrongChoices = currentQuestion.answer_choices.filter(
        (answerChoice) => answerChoice !== currentQuestion.correct_answer
      );
      const wrongChoiceSeed = `${currentQuestion.id}:wrong:${currentStreak}:${rivalCurrentStreak}`;
      const wrongChoiceIndex = Math.floor(
        seededUnitInterval(wrongChoiceSeed) * Math.max(1, wrongChoices.length)
      );
      const rivalSelectedAnswer = rivalIsCorrect
        ? currentQuestion.correct_answer
        : wrongChoices[wrongChoiceIndex] || currentQuestion.correct_answer;

      setRivalAnswers((prev) => [
        ...prev,
        {
          questionId: currentQuestion.id,
          selectedAnswer: rivalSelectedAnswer,
          isCorrect: rivalIsCorrect,
          responseTimeMs: rivalResponseTimeMs,
        },
      ]);

      if (rivalIsCorrect) {
        setRivalCurrentStreak((prevStreak) => {
          const nextStreak = prevStreak + 1;
          const points = calculatePointsForStreak(nextStreak);
          setRivalScore((prevScore) => prevScore + points);
          setRivalBestStreak((prevBest) => Math.max(prevBest, nextStreak));
          return nextStreak;
        });
      } else {
        setRivalCurrentStreak(0);
      }

      setIsRivalResolving(false);
      rivalResolveTimerRef.current = null;
    }, revealDelay);
  };

  // open_response counterpart to handleSelectAnswer: correctness isn't
  // known instantly, so this calls /api/grade-open-response and only
  // applies the streak/score outcome once that grading resolves.
  // `answerOverride` lets voice mode submit a spoken transcript directly
  // without first round-tripping through openResponseDraft state (whose
  // setter wouldn't be visible to this closure until the next render).
  const handleSubmitOpenResponse = async (answerOverride?: string) => {
    if (selectedChoice || introCountdown !== null || isGradingOpenResponse) return;

    const trimmedAnswer = (answerOverride ?? openResponseDraft).trim();
    if (!trimmedAnswer) return;

    const currentQuestion = questions[currentIndex];
    setIsGradingOpenResponse(true);
    setOpenResponseError(null);

    try {
      const response = await fetch("/api/grade-open-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          studentAnswer: trimmedAnswer,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setOpenResponseError(`Server error (status ${response.status}). Please try again.`);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setOpenResponseError(data.error || "Failed to grade your answer.");
        return;
      }

      const responseTimeMs = Math.max(
        0,
        (elapsedSeconds - questionStartSecondsRef.current) * 1000
      );
      const isCorrect = Boolean(data.isCorrect);

      setSelectedChoice(trimmedAnswer);
      setLastAnswerWasCorrect(isCorrect);
      setOpenResponseFeedback({
        score: typeof data.score === "number" ? data.score : 0,
        pointsAddressed: Array.isArray(data.pointsAddressed) ? data.pointsAddressed : [],
        pointsMissed: Array.isArray(data.pointsMissed) ? data.pointsMissed : [],
        feedback: typeof data.feedback === "string" ? data.feedback : "",
      });
      setAnswers((prev) => [
        ...prev,
        {
          questionId: currentQuestion.id,
          selectedAnswer: trimmedAnswer,
          isCorrect,
          responseTimeMs,
        },
      ]);
      applyAnswerOutcome(isCorrect);
    } catch (error) {
      setOpenResponseError(
        error instanceof Error ? error.message : "Failed to grade your answer."
      );
    } finally {
      setIsGradingOpenResponse(false);
    }
  };

  // Voice mode: read the current question aloud, then listen for a spoken
  // answer, once per question. Guarded by voicePromptedQuestionIdRef so
  // this doesn't re-fire on unrelated re-renders of the same question (only
  // a real question change, toggling voice mode on, or the intro countdown
  // clearing should re-trigger it).
  useEffect(() => {
    if (!voiceModeEnabled || !voice.isSupported) return;
    if (!hasStarted || introCountdown !== null || isFinishing) return;

    const activeQuestion = questions[currentIndex];
    if (!activeQuestion || selectedChoice || isGradingOpenResponse) return;
    if (voicePromptedQuestionIdRef.current === activeQuestion.id) return;

    voicePromptedQuestionIdRef.current = activeQuestion.id;
    let cancelled = false;

    async function promptAndListen() {
      const isOpenResponse = activeQuestion.question_type === "open_response";
      const prompt = isOpenResponse
        ? activeQuestion.question_text
        : `${activeQuestion.question_text} Your options are: ${activeQuestion.answer_choices
            .map((choice, i) => `${String.fromCharCode(65 + i)}, ${choice}`)
            .join(". ")}`;

      await voice.speak(prompt);
      if (cancelled) return;

      const transcript = await voice.listenOnce();
      if (cancelled || !transcript) return;

      if (isOpenResponse) {
        void handleSubmitOpenResponse(transcript);
      } else {
        const matched = matchSpokenChoice(transcript, activeQuestion.answer_choices);
        if (matched) handleSelectAnswer(matched);
      }
    }

    void promptAndListen();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceModeEnabled, voice.isSupported, hasStarted, introCountdown, isFinishing, currentIndex, selectedChoice, isGradingOpenResponse, questions]);

  const handleNext = useCallback(async () => {
    if (effectiveStudyMode === "rival" && isRivalResolving) {
      return;
    }

    const isLastQuestion = currentIndex === questions.length - 1;

    if (!isLastQuestion) {
      questionStartSecondsRef.current = elapsedSeconds;
      setCurrentIndex((prev) => prev + 1);
      setSelectedChoice(null);
      setLastAnswerWasCorrect(null);
      setOpenResponseDraft("");
      setOpenResponseFeedback(null);
      setOpenResponseError(null);
      return;
    }

    // This was the last question — save the finished match. Guarded so
    // this branch can only ever run once per battle, even if the button
    // is somehow clicked twice in quick succession.
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;

    const correctCount = answers.filter((a) => a.isCorrect).length;

    const topicStats = new Map<string, { missed: number; total: number }>();
    for (const answer of answers) {
      const topic = questions.find((q) => q.id === answer.questionId)?.topic || "General";
      const entry = topicStats.get(topic) || { missed: 0, total: 0 };
      entry.total += 1;
      if (!answer.isCorrect) entry.missed += 1;
      topicStats.set(topic, entry);
    }

    setFinishedSummary({
      correctCount,
      totalQuestions: questions.length,
      totalScore,
      bestStreak,
      elapsedSeconds,
      topicBreakdown: Array.from(topicStats.entries())
        .map(([topic, stats]) => ({ topic, ...stats }))
        .sort((a, b) => b.missed - a.missed)
        .slice(0, 5),
    });
    setIsFinishing(true);
    setSaveError(null);

    let response: Response;

    try {
      // authFetch attaches the logged-in player's session token (when one
      // exists) so the match can be stamped with a real user_id server-side.
      // Guests get no Authorization header and the battle still saves fine.
      response = await authFetch("/api/battle/finish", {
        method: "POST",
        body: JSON.stringify({
          deckId,
          playerName: playerName || accountDisplayName || deck?.student_name || "Player",
          score: totalScore,
          totalQuestions: questions.length,
          correctAnswers: correctCount,
          timeTakenSeconds: elapsedSeconds,
          answers,
          challengeFromMatchId,
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
      studyMode: effectiveStudyMode,
      rivalScore,
      rivalRank: rivalReadiness?.rank,
      rivalName: rivalReadiness?.rivalName,
    });

    const resultSearchParams = new URLSearchParams();

    if (challengeFromMatchId) {
      resultSearchParams.set("challengeFrom", challengeFromMatchId);
    }

    if (challengeBaseScore) {
      resultSearchParams.set("challengeScore", challengeBaseScore);
    }

    if (effectiveStudyMode === "boss" && bossReadiness) {
      resultSearchParams.set("mode", "boss");
      resultSearchParams.set("bossName", bossReadiness.bossName);
      resultSearchParams.set("bossTargetScore", String(bossReadiness.requiredScore));
      resultSearchParams.set("bossTargetAccuracy", String(bossReadiness.requiredAccuracy));
      resultSearchParams.set("bossWeakTopics", bossReadiness.weakTopics.join("|"));
      resultSearchParams.set("bossStrongTopics", bossReadiness.strongTopics.join("|"));
      resultSearchParams.set("nextBoss", bossReadiness.nextRecommendedBoss);
    }

    if (effectiveStudyMode === "rival" && rivalReadiness) {
      const rivalCorrect = rivalAnswers.filter((answer) => answer.isCorrect).length;
      const rivalAccuracy =
        rivalAnswers.length > 0
          ? Math.round((rivalCorrect / rivalAnswers.length) * 100)
          : 0;

      resultSearchParams.set("mode", "rival");
      resultSearchParams.set("rivalName", rivalReadiness.rivalName);
      resultSearchParams.set("rivalRank", rivalReadiness.rank);
      resultSearchParams.set("rivalScore", String(rivalScore));
      resultSearchParams.set("rivalAccuracy", String(rivalAccuracy));
      resultSearchParams.set("rivalTargetAccuracy", String(rivalReadiness.targetAccuracy));
      resultSearchParams.set("rivalWeakTopics", rivalReadiness.weakTopics.join("|"));
      resultSearchParams.set("rivalStrengths", rivalReadiness.rivalStrengths.join("|"));
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
    router,
    challengeFromMatchId,
    challengeBaseScore,
    effectiveStudyMode,
    isRivalResolving,
    bossReadiness,
    rivalAnswers,
    rivalScore,
    rivalReadiness,
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
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/decks"
              className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/80 transition-colors duration-150 hover:bg-white/10"
            >
              Back to Decks
            </Link>
            <Link
              href="/create"
              className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-4 py-2.5 text-sm font-bold text-white"
            >
              Create New Deck
            </Link>
          </div>
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

        {effectiveStudyMode === "boss" && (
          <div className="mb-4 w-full max-w-xl rounded-2xl border border-fuchsia-400/25 bg-gradient-to-r from-fuchsia-500/10 via-black/30 to-cyan-500/10 px-4 py-3.5 sm:mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-fuchsia-200">
                Boss Battle Protocol
              </p>
              {isBossLoading ? (
                <span className="text-[11px] font-semibold text-white/55">
                  Checking unlock status...
                </span>
              ) : bossReadiness?.unlocked ? (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Unlocked
                </span>
              ) : (
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Locked
                </span>
              )}
            </div>

            <p className="mt-2 text-sm font-semibold text-white/90">
              {bossReadiness?.bossName || `${deck.course_name} Boss`}
            </p>
            <p className="mt-1 text-xs text-white/65">
              Defeat condition: {bossReadiness?.requiredScore || Math.round((effectiveQuestionLimit || 12) * 95)}+ points and {bossReadiness?.requiredAccuracy || 70}%+ accuracy.
            </p>
            <p className="mt-2 text-xs text-white/55">
              {bossReadiness?.practiceAdvice || "Build weak-topic reps to unlock this high-stakes review battle."}
            </p>

            {bossReadiness && bossReadiness.weakTopics.length > 0 && (
              <p className="mt-2 text-xs text-red-200/85">
                Weak focus: {bossReadiness.weakTopics.join(" · ")}
              </p>
            )}

            {bossReadiness && bossReadiness.strongTopics.length > 0 && (
              <p className="mt-1 text-xs text-emerald-200/85">
                Strong topics: {bossReadiness.strongTopics.join(" · ")}
              </p>
            )}
          </div>
        )}

        {effectiveStudyMode === "rival" && rivalReadiness && (
          <div className="mb-4 w-full max-w-xl rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/12 via-black/30 to-fuchsia-500/10 px-4 py-3.5 sm:mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200">
                {isGhostRival ? "Ghost Rival Protocol" : "Study Rival Protocol"}
              </p>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                {isGhostRival ? "Recorded Run" : `Rank ${rivalReadiness.rank}`}
              </span>
            </div>

            <p className="mt-2 text-sm font-semibold text-white/90">
              {rivalReadiness.rivalName}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Rival Acc</p>
                <p className="mt-1 text-xs font-bold text-white">{rivalReadiness.targetAccuracy}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Rival Speed</p>
                <p className="mt-1 text-xs font-bold text-white">~{Math.round(rivalReadiness.expectedResponseMs / 1000)}s</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Your Avg</p>
                <p className="mt-1 text-xs font-bold text-white">{rivalReadiness.playerAverageAccuracy}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Battles</p>
                <p className="mt-1 text-xs font-bold text-white">{rivalReadiness.attempts}</p>
              </div>
            </div>

            <p className="mt-2 text-xs text-red-200/85">
              Weak-topic focus: {rivalReadiness.weakTopics.length > 0 ? rivalReadiness.weakTopics.slice(0, 3).join(" · ") : "Building baseline focus from this run."}
            </p>
            <p className="mt-1 text-xs text-emerald-200/85">
              Rival strengths: {rivalReadiness.rivalStrengths.join(" · ")}
            </p>

            {rivalReadiness.nextUnlock && (
              <p className="mt-2 text-xs text-cyan-100/90">
                Unlock next rival ({rivalReadiness.nextUnlock.rank}): {rivalReadiness.nextUnlock.requirement}
              </p>
            )}
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

        <div className="mt-4 w-full max-w-xl rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] px-4 py-3 text-center text-xs text-cyan-100/90">
          Flow: Battle now &rarr; review weak topics in results &rarr; run a focused rematch &rarr; improve your score.
        </div>

        {engagementPreview && (
          <div className="mt-4 w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Level</p>
                <p className="mt-1 text-base font-black text-cyan-200">{engagementPreview.level}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Day Streak</p>
                <p className="mt-1 text-base font-black text-amber-200">{engagementPreview.currentStreakDays}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Daily Goal</p>
                <p className="mt-1 text-base font-black text-emerald-200">{engagementPreview.dailyBattles}/2</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Rank</p>
                <p className="mt-1 text-base font-black text-fuchsia-200">{engagementPreview.rankLabel}</p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.08] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-cyan-100">
                <span>{engagementPreview.seasonLabel} progression</span>
                <span>{Math.round(engagementPreview.seasonProgressPercent)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-700"
                  style={{ width: `${Math.max(4, engagementPreview.seasonProgressPercent)}%` }}
                />
              </div>
              {engagementPreview.nextMilestoneXp !== null && (
                <p className="mt-2 text-[11px] text-cyan-100/80">
                  Next XP milestone: {engagementPreview.nextMilestoneXp}
                </p>
              )}
            </div>

            {engagementPreview.recentHistory.length > 0 && (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">Recent Battles</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {engagementPreview.recentHistory.map((entry) => (
                    <span
                      key={entry.matchId}
                      className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-100"
                    >
                      {entry.score} pts · {entry.accuracy}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            disabled={
              effectiveStudyMode === "boss" &&
              !!bossReadiness &&
              !bossReadiness.unlocked
            }
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
          >
            {effectiveStudyMode === "boss"
              ? "Start Boss Battle"
              : effectiveStudyMode === "rival"
                ? "Start Rival Battle"
                : "Start Battle"}
          </button>

          {effectiveStudyMode === "boss" && bossReadiness && !bossReadiness.unlocked && (
            <p className="mt-2 text-center text-xs text-amber-200/80">
              Boss is locked. Complete more weak-topic practice first.
            </p>
          )}
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
  // The score, streak, and topic breakdown are already known from local
  // state the instant the last question resolves, so they render here
  // immediately instead of behind a bare spinner -- the /api/battle/finish
  // save (and the redirect to the server-rendered /results/[matchId] page)
  // continues in the background underneath this preview.
  if (isFinishing) {
    const accuracyPercent = finishedSummary
      ? Math.round((finishedSummary.correctCount / Math.max(1, finishedSummary.totalQuestions)) * 100)
      : 0;

    return (
      <Background>
        <div className="w-full max-w-md text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-300/80">
            Battle Complete
          </p>

          {finishedSummary ? (
            <>
              <p className="mt-3 text-5xl font-black text-white">{finishedSummary.totalScore}</p>
              <p className="mt-1 text-sm text-white/50">points</p>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xl font-bold text-white">
                    {finishedSummary.correctCount}/{finishedSummary.totalQuestions}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-white/45">Correct</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xl font-bold text-white">{accuracyPercent}%</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-white/45">Accuracy</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                  <p className="text-xl font-bold text-white">{finishedSummary.bestStreak}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-white/45">Best streak</p>
                </div>
              </div>

              {finishedSummary.topicBreakdown.some((entry) => entry.missed > 0) && (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">
                    Topics to review
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {finishedSummary.topicBreakdown
                      .filter((entry) => entry.missed > 0)
                      .map((entry) => (
                        <div key={entry.topic} className="flex items-center justify-between text-sm">
                          <span className="text-white/80">{entry.topic}</span>
                          <span className="text-white/45">
                            {entry.missed}/{entry.total} missed
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-2xl font-bold text-white">Wrapping up...</p>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/50">
            <svg className="h-4 w-4 animate-spin text-fuchsia-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Preparing your full results...
          </div>

          {saveError && (
            <div className="mt-5 w-full rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
              {saveError}
            </div>
          )}
        </div>
      </Background>
    );
  }

  // ---------- Quiz in progress ----------
  const currentQuestion = questions[currentIndex];
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;
  const showFeedback = selectedChoice !== null;
  const isOpenResponseQuestion = currentQuestion.question_type === "open_response";
  const answeredCorrectly = isOpenResponseQuestion
    ? lastAnswerWasCorrect === true
    : selectedChoice === currentQuestion.correct_answer;
  const bonusForCurrentStreak =
    currentStreak >= 5
      ? STREAK_BONUS_TIER_2
      : currentStreak >= 3
      ? STREAK_BONUS_TIER_1
      : 0;

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const answeredCount = answers.length;
  const liveCorrectCount = answers.filter((answer) => answer.isCorrect).length;
  const liveAccuracyPercent =
    answeredCount > 0 ? Math.round((liveCorrectCount / answeredCount) * 100) : 0;
  const liveMissedQuestions = answers
    .filter((answer) => !answer.isCorrect)
    .map((answer) => {
      const question = questionById.get(answer.questionId);
      if (!question) return null;

      return {
        questionText: question.question_text,
        selectedAnswer: answer.selectedAnswer,
        correctAnswer: question.correct_answer,
        topic: question.topic,
        explanation: question.explanation,
      };
    })
    .filter((item): item is {
      questionText: string;
      selectedAnswer: string;
      correctAnswer: string;
      topic: string;
      explanation: string;
    } => item !== null);

  const liveWeakTopicCounts = new Map<string, number>();
  for (const item of liveMissedQuestions) {
    liveWeakTopicCounts.set(item.topic, (liveWeakTopicCounts.get(item.topic) || 0) + 1);
  }

  const liveWeakTopics = Array.from(liveWeakTopicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, 5);

  const liveMistakeDna = answers
    .filter((answer) => !answer.isCorrect)
    .map((answer) => {
      const question = questionById.get(answer.questionId);
      if (!question) return null;

      const quickMiss = answer.responseTimeMs <= 5000 && question.difficulty.toLowerCase() !== "hard";
      const slowMiss = answer.responseTimeMs >= 15000;
      const likelyMisread = /all|none|except|not|always|never|both/i.test(answer.selectedAnswer);
      const mistakeType = quickMiss
        ? "careless_error"
        : slowMiss
          ? "speed_trap"
          : likelyMisread
            ? "misread_question"
            : question.difficulty.toLowerCase() === "hard"
              ? "concept_gap"
              : "guessing_pattern";

      return {
        questionId: answer.questionId,
        topic: question.topic,
        selectedAnswer: answer.selectedAnswer,
        correctAnswer: question.correct_answer,
        misunderstoodConcept: question.question_text,
        mistakeType,
      };
    })
    .filter((item) => item !== null);

  const topicStatsMap = new Map<string, { correct: number; total: number }>();
  for (const answer of answers) {
    const question = questionById.get(answer.questionId);
    if (!question) continue;

    const topic = question.topic || "General";
    const bucket = topicStatsMap.get(topic) || { correct: 0, total: 0 };
    bucket.total += 1;
    if (answer.isCorrect) bucket.correct += 1;
    topicStatsMap.set(topic, bucket);
  }

  const liveMasteryProgress = Array.from(topicStatsMap.entries())
    .map(([topic, stats]) => ({
      label: topic,
      value: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      details: `${stats.correct}/${stats.total} correct`,
    }))
    .slice(0, 6);

  const rivalAnsweredCount = rivalAnswers.length;
  const rivalCorrectCount = rivalAnswers.filter((answer) => answer.isCorrect).length;
  const rivalAccuracyPercent =
    rivalAnsweredCount > 0 ? Math.round((rivalCorrectCount / rivalAnsweredCount) * 100) : 0;
  const rivalProgressPercent =
    questions.length > 0 ? Math.round((rivalAnsweredCount / questions.length) * 100) : 0;

  const rivalTopicStatsMap = new Map<string, { correct: number; total: number }>();
  for (const rivalAnswer of rivalAnswers) {
    const question = questionById.get(rivalAnswer.questionId);
    if (!question) continue;

    const topic = question.topic || "General";
    const bucket = rivalTopicStatsMap.get(topic) || { correct: 0, total: 0 };
    bucket.total += 1;
    if (rivalAnswer.isCorrect) bucket.correct += 1;
    rivalTopicStatsMap.set(topic, bucket);
  }

  const rivalBetterTopics = Array.from(rivalTopicStatsMap.entries())
    .map(([topic, rivalStats]) => {
      const playerStats = topicStatsMap.get(topic) || { correct: 0, total: 0 };
      const rivalTopicAccuracy =
        rivalStats.total > 0 ? Math.round((rivalStats.correct / rivalStats.total) * 100) : 0;
      const playerTopicAccuracy =
        playerStats.total > 0 ? Math.round((playerStats.correct / playerStats.total) * 100) : 0;

      return {
        topic,
        gap: rivalTopicAccuracy - playerTopicAccuracy,
      };
    })
    .filter((entry) => entry.gap >= 12)
    .sort((a, b) => b.gap - a.gap)
    .map((entry) => entry.topic)
    .slice(0, 3);

  const liveRivalOutcome =
    totalScore > rivalScore
      ? "You are leading"
      : rivalScore > totalScore
        ? "Rival is leading"
        : "Tie";

  return (
    <Background>
      <div className="w-full max-w-[1440px]">
        <div className="grid items-start gap-4 xl:gap-6 2xl:gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="w-full max-w-3xl xl:max-w-none">
        {effectiveStudyMode === "boss" && bossReadiness && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3.5 py-2.5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200">
              {bossReadiness.bossName}
            </p>
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-cyan-200">
              Goal {bossReadiness.requiredScore}+ pts
            </span>
          </div>
        )}

        {effectiveStudyMode === "rival" && rivalReadiness && (
          <div className="mb-3 rounded-xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/[0.1] via-black/25 to-fuchsia-500/[0.08] px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <OpponentFace mood={moodFromStreak(rivalCurrentStreak)} className="h-9 w-9 text-lg" />
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
                  {isGhostRival ? "Ghost Rival Arena" : "Study Rival Arena"}
                </p>
              </div>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-fuchsia-200">
                {rivalReadiness.rivalName} · {rivalReadiness.rank}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Student Score</p>
                <p className="mt-1 text-sm font-bold text-white">{totalScore}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Rival Score</p>
                <p className="mt-1 text-sm font-bold text-white">{rivalScore}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Live Progress</p>
                <p className="mt-1 text-sm font-bold text-white">{progressPercent.toFixed(0)}% / {rivalProgressPercent}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Win/Loss</p>
                <p className="mt-1 text-sm font-bold text-white">{liveRivalOutcome}</p>
              </div>
            </div>

            <p className="mt-2 text-xs text-white/75">
              Rival better at: {rivalBetterTopics.length > 0 ? rivalBetterTopics.join(" · ") : rivalReadiness.rivalStrengths.join(" · ")}
            </p>
            <p className="mt-1 text-xs text-amber-200/90">
              Improve next: {rivalReadiness.playerNeedsImprovement.join(" · ")}
            </p>
            <p className="mt-1 text-xs text-white/65">
              Rival streak: {rivalCurrentStreak} (best {rivalBestStreak})
            </p>
          </div>
        )}

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
          <motion.div
            key={totalScore}
            initial={{ scale: 0.85 }}
            animate={{ scale: 1 }}
            transition={springBouncy}
            className="flex items-center gap-1.5 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1"
          >
            <span className="text-sm font-black text-fuchsia-300 tabular-nums">
              {displayedScore}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300/70">
              pts
            </span>
          </motion.div>

          <div className="flex items-center gap-2">
            {bestStreak > 0 && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Best: {bestStreak}
              </span>
            )}
            <motion.div
              key={currentStreak}
              initial={currentStreak > 0 ? { scale: 0.7 } : false}
              animate={{ scale: 1 }}
              transition={springBouncy}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${
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
                className={`text-sm font-bold tabular-nums ${
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
            </motion.div>
          </div>
        </div>

        {voice.isSupported && (
          <div className="mb-4 flex items-center justify-between gap-2 sm:mb-5">
            <button
              type="button"
              onClick={() => {
                if (voiceModeEnabled) {
                  voice.stopListening();
                  voice.cancelSpeech();
                  voicePromptedQuestionIdRef.current = null;
                }
                setVoiceModeEnabled((prev) => !prev);
              }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                voiceModeEnabled
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              <span aria-hidden>🎙️</span>
              Voice Mode {voiceModeEnabled ? "On" : "Off"}
            </button>

            {voiceModeEnabled && (voice.isSpeaking || voice.isListening) && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {voice.isSpeaking ? "VYRA is reading the question..." : "Listening for your answer..."}
              </span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-white/10 sm:mb-8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Question card */}
        <div
          key={currentQuestion?.id}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-6 lg:p-7 xl:p-8"
          style={{
            animation: wrongShake
              ? "slide-up-fade 240ms ease-out, battle-shake 420ms ease-in-out"
              : "slide-up-fade 240ms ease-out",
          }}
        >
          <ConfettiBurst show={showRewardBurst} />

          {introCountdown !== null && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-[#030812]/85 backdrop-blur-sm"
              style={{ zIndex: UI_Z_INDEX.pageContent }}
            >
              <div key={introCountdown} className="text-center" style={{ animation: "pulse-enter 260ms ease-out" }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-200">
                  Battle Intro
                </p>
                <p className="mt-2 text-6xl font-black text-white sm:text-7xl">
                  {introCountdown === 0 ? "GO" : introCountdown}
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Precision first. Speed second.
                </p>
              </div>
            </div>
          )}

          <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
            {currentQuestion.topic}
          </span>
          <h2 className="mt-3 text-base font-bold leading-snug break-words sm:text-lg md:text-xl">
            {currentQuestion.question_text}
          </h2>

          {isOpenResponseQuestion ? (
            <div className="mt-5 sm:mt-6">
              {!showFeedback ? (
                <>
                  <textarea
                    value={openResponseDraft}
                    onChange={(e) => setOpenResponseDraft(e.target.value)}
                    disabled={isGradingOpenResponse}
                    rows={6}
                    placeholder={
                      currentQuestion.reasoning_format === "step_by_step"
                        ? "Show your work step by step, then state your final answer..."
                        : "Take a position and back it up with evidence from your notes..."
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-sm text-white/90 placeholder:text-white/30 focus:border-fuchsia-400/50 focus:outline-none disabled:opacity-60 sm:text-base"
                  />
                  {openResponseError && (
                    <p className="mt-2 text-xs text-red-300">{openResponseError}</p>
                  )}
                  <button
                    onClick={() => handleSubmitOpenResponse()}
                    disabled={!openResponseDraft.trim() || isGradingOpenResponse}
                    className="mt-3 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
                  >
                    {isGradingOpenResponse ? "Grading your answer..." : "Submit Answer"}
                  </button>
                </>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-sm text-white/80 sm:text-base">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Your answer
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words">{selectedChoice}</p>
                </div>
              )}
            </div>
          ) : (
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
                  <motion.button
                    key={i}
                    onClick={() => handleSelectAnswer(choice)}
                    disabled={showFeedback}
                    initial={false}
                    animate={
                      showFeedback && (isCorrectChoice || isSelected)
                        ? { scale: [1, 1.035, 1] }
                        : { scale: 1 }
                    }
                    // Multi-keyframe arrays aren't supported by spring/inertia
                    // transitions (framer-motion only allows two keyframes
                    // there) -- this pop needs a tween, not springBouncy.
                    // whileHover/whileTap get their own spring transition
                    // below instead of inheriting this tween.
                    transition={{ duration: 0.32, ease: "easeOut" }}
                    whileHover={!showFeedback ? { scale: 1.015, x: 2, transition: springSnappy } : undefined}
                    whileTap={!showFeedback ? { scale: 0.97, transition: springSnappy } : undefined}
                    className={`flex min-h-[3.3rem] w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-colors duration-200 disabled:cursor-default sm:min-h-[3.5rem] sm:py-3.5 sm:text-base ${choiceStyles}`}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white/70">
                      {CHOICE_LETTERS[i]}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-white/90">
                      {choice}
                    </span>
                    {resultIcon && (
                      <motion.span
                        initial={{ scale: 0, rotate: -20 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={springBouncy}
                        className="flex-shrink-0 text-lg leading-none"
                      >
                        {resultIcon}
                      </motion.span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* Explanation / grading feedback shown after answering */}
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
                  {isOpenResponseQuestion
                    ? `Score: ${openResponseFeedback?.score ?? 0}/100`
                    : answeredCorrectly
                      ? "Correct!"
                      : "Not quite"}
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

              {isOpenResponseQuestion ? (
                openResponseFeedback && (
                  <div className="mt-2 space-y-2.5">
                    <p className="break-words text-white/70">{openResponseFeedback.feedback}</p>

                    {openResponseFeedback.pointsAddressed.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/80">
                          Addressed
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-white/60">
                          {openResponseFeedback.pointsAddressed.map((point, i) => (
                            <li key={i} className="break-words">{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {openResponseFeedback.pointsMissed.length > 0 && (
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-red-300/80">
                          Missed
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-white/60">
                          {openResponseFeedback.pointsMissed.map((point, i) => (
                            <li key={i} className="break-words">{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                      <p className="text-[11px] font-bold text-white/55">Model answer</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-white/70">
                        {currentQuestion.explanation}
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <>
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
                </>
              )}

              {effectiveStudyMode === "rival" && !isOpenResponseQuestion && (
                <div className="mt-2 text-xs text-cyan-200/85">
                  {isRivalResolving ? (
                    <span className="inline-flex items-center gap-2">
                      {rivalReadiness?.rivalName || "Rival"} is locking in an answer
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:300ms]" />
                      </span>
                    </span>
                  ) : (
                    <p>{`${rivalReadiness?.rivalName || "Rival"} accuracy: ${rivalAccuracyPercent}% · ${isGhostRival ? "recorded" : "target"} ${rivalReadiness?.targetAccuracy || 0}%`}</p>
                  )}
                </div>
              )}
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
              disabled={effectiveStudyMode === "rival" && isRivalResolving}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:px-8 sm:hover:scale-[1.02]"
            >
              {effectiveStudyMode === "rival" && isRivalResolving
                ? "Rival Answering..."
                : currentIndex === questions.length - 1
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

          <VyraCoach
            deckId={deck.id}
            deckTitle={deck.title}
            courseName={deck.course_name}
            playerName={playerName || accountDisplayName || deck.student_name}
            weakTopics={liveWeakTopics}
            missedQuestions={liveMissedQuestions}
            mistakeDna={liveMistakeDna}
            battleScore={totalScore}
            accuracyPercent={liveAccuracyPercent}
            previousRematches={0}
            masteryProgress={liveMasteryProgress}
            currentQuestion={{
              questionText: currentQuestion.question_text,
              selectedAnswer: selectedChoice || undefined,
              correctAnswer: currentQuestion.correct_answer,
              explanation: currentQuestion.explanation,
            }}
            contextLabel="Battle"
            layout="docked"
          />
        </div>
      </div>
    </Background>
  );
}