"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/trackEvent";
import type { AnalyticsEventName } from "@/lib/trackEvent";
import GigglesCoach from "@/app/components/GigglesCoach";
import ConfettiBurst from "@/app/components/ConfettiBurst";
import {
  buildClashPathReport,
  type ClashPathAttempt,
  type ClashPathQuestionResult,
  type ClashPathReport,
} from "@/lib/clashpath";
import {
  buildMistakeBreakdowns,
  getMistakeTypeLabel,
  type MistakeBreakdown,
  type MistakeHistoryStats,
} from "@/lib/mistakeBreakdown";

type Match = {
  id: string;
  deck_id: string;
  player_name: string;
  user_id?: string | null;
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

// Shape of a row read directly from the match_answers table.
type MatchAnswerRow = {
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  response_time_ms?: number | null;
};

type HistoricalMatchRow = {
  id: string;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number;
  created_at: string;
};

type HistoricalMatchAnswerRow = {
  match_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  response_time_ms?: number | null;
};

type WeakTopic = {
  topic: string;
  missedCount: number;
  message: string;
};

type ReviewItem = {
  question: Question;
  selectedAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
};

type TopicStat = {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
};

type ResourceLink = {
  label: string;
  url: string;
};

type LeaderboardEntry = {
  id: string;
  player_name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number;
};

type DeckAttemptRecord = {
  score: number;
  accuracy: number;
  matchId: string;
  timestamp: string;
};

type ProgressSnapshot = {
  totalXp: number;
  awardedMatchIds: string[];
  bestScoresByDeck: Record<string, DeckAttemptRecord>;
  lastAttemptsByDeck: Record<string, DeckAttemptRecord>;
  bossAwardedMatchIds: string[];
  bossBadges: string[];
};

type BossMistakeDnaStat = {
  type: string;
  count: number;
};

const BOSS_BONUS_XP = 250;

type BattleProgress = {
  xpEarned: number;
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpToNextLevel: number;
  previousBestScore: number | null;
  newPersonalBest: boolean;
  improvementPercent: number | null;
  progressMessage: string;
  weakestTopic: string | null;
};

type StudyDay = {
  day: number;
  title: string;
  tasks: string[];
};

const REPORT_REASONS = [
  "Wrong answer",
  "Confusing question",
  "Not based on notes",
  "Duplicate question",
  "Other",
];

// Tracks the report UI state for a single question card
type ReportState = {
  isFormOpen: boolean;
  selectedReason: string;
  isSubmitting: boolean;
  isSubmitted: boolean;
  error: string | null;
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
    user_id:
      typeof candidate.user_id === "string"
        ? candidate.user_id
        : candidate.user_id === null
          ? null
          : undefined,
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

// Builds a short, generic improvement message for a topic.
function buildImprovementMessage(topic: string, missedCount: number): string {
  if (missedCount === 1) {
    return `Review your notes on ${topic} — one question slipped through here.`;
  }
  return `Review your notes on ${topic} and practice a few more questions on this topic.`;
}

// Groups review items by topic and computes accuracy per topic.
function buildTopicStats(reviewItems: ReviewItem[]): TopicStat[] {
  const statsByTopic = new Map<string, { correct: number; total: number }>();

  for (const item of reviewItems) {
    const topic = item.question.topic || "General";
    const entry = statsByTopic.get(topic) || { correct: 0, total: 0 };
    entry.total += 1;
    if (item.isCorrect) entry.correct += 1;
    statsByTopic.set(topic, entry);
  }

  return Array.from(statsByTopic.entries()).map(([topic, { correct, total }]) => ({
    topic,
    correct,
    total,
    accuracy: Math.round((correct / total) * 100),
  }));
}

// Builds a short "what to review" explanation for the Study Plan card.
function buildStudyExplanation(topic: string): string {
  return `Focus on the core definitions, key facts, and examples related to ${topic}. Re-read the relevant section of your notes, then work back through the missed questions above until the reasoning makes sense without looking at the explanation.`;
}

// Builds a small, concrete task the user can actually do for a topic.
function buildMiniTask(topic: string): string {
  return `Write a 4-5 sentence summary of ${topic} in your own words, then explain it out loud as if teaching a friend.`;
}

function normalizeProgressScope(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProgressStorageKey(match: Match): string {
  const scope = match.user_id
    ? `user:${match.user_id}`
    : `player:${normalizeProgressScope(match.player_name || "guest")}`;

  return `studyclash-progression:v1:${scope}`;
}

function loadProgressSnapshot(storageKey: string): ProgressSnapshot {
  if (typeof window === "undefined") {
    return {
      totalXp: 0,
      awardedMatchIds: [],
      bestScoresByDeck: {},
      lastAttemptsByDeck: {},
      bossAwardedMatchIds: [],
      bossBadges: [],
    };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {
        totalXp: 0,
        awardedMatchIds: [],
        bestScoresByDeck: {},
        lastAttemptsByDeck: {},
        bossAwardedMatchIds: [],
        bossBadges: [],
      };
    }

    const parsed = JSON.parse(raw) as Partial<ProgressSnapshot>;
    return {
      totalXp: parsed.totalXp || 0,
      awardedMatchIds: parsed.awardedMatchIds || [],
      bestScoresByDeck: parsed.bestScoresByDeck || {},
      lastAttemptsByDeck: parsed.lastAttemptsByDeck || {},
      bossAwardedMatchIds: parsed.bossAwardedMatchIds || [],
      bossBadges: parsed.bossBadges || [],
    };
  } catch {
    return {
      totalXp: 0,
      awardedMatchIds: [],
      bestScoresByDeck: {},
      lastAttemptsByDeck: {},
      bossAwardedMatchIds: [],
      bossBadges: [],
    };
  }
}

function saveProgressSnapshot(storageKey: string, snapshot: ProgressSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

function parseDelimitedList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split("|")
    .map((item) => decodeURIComponent(item).trim())
    .filter(Boolean);
}

function buildBossMistakeDnaStats(items: MistakeBreakdown[]): BossMistakeDnaStat[] {
  const byType = new Map<string, number>();

  for (const item of items) {
    const label = getMistakeTypeLabel(item.confidenceRating);
    byType.set(label, (byType.get(label) || 0) + 1);
  }

  return Array.from(byType.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

function calculateBattleXp(params: {
  accuracyPercent: number;
  averageResponseTimeMs: number;
  totalQuestions: number;
  completedQuestions: number;
}): number {
  const { accuracyPercent, averageResponseTimeMs, totalQuestions, completedQuestions } = params;
  const completionRate = totalQuestions > 0 ? completedQuestions / totalQuestions : 1;
  const accuracyBonus = Math.round(accuracyPercent * 6);
  const completionBonus = Math.round(completionRate * 120);
  const speedBonus = Math.max(0, 180 - Math.round(averageResponseTimeMs / 1000) * 12);

  return Math.max(50, accuracyBonus + completionBonus + speedBonus);
}

function calculateLevel(totalXp: number): {
  level: number;
  xpInLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
} {
  const level = Math.floor(totalXp / 500) + 1;
  const xpInLevel = totalXp % 500;

  return {
    level,
    xpInLevel,
    xpToNextLevel: 500 - xpInLevel,
    progressPercent: (xpInLevel / 500) * 100,
  };
}

function buildProgressMessage(params: {
  improvementPercent: number | null;
  weakestTopic: string | null;
  newPersonalBest: boolean;
}): string {
  const { improvementPercent, weakestTopic, newPersonalBest } = params;

  if (improvementPercent !== null && improvementPercent > 0) {
    return `You improved by ${improvementPercent}% from your last attempt.`;
  }

  if (improvementPercent !== null && improvementPercent < 0) {
    const direction = Math.abs(improvementPercent);
    return `You are ${direction}% below your last attempt. Your weakest topic is ${weakestTopic || "the missed material"}. Practice that next.`;
  }

  if (newPersonalBest) {
    return `New personal best on this deck. Keep pushing the score higher.`;
  }

  if (weakestTopic) {
    return `Your weakest topic is ${weakestTopic}. Practice that next.`;
  }

  return `Solid run. Rematch to push your score higher.`;
}

function normalizeTopicKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveKhanAcademyUrl(topic: string): string {
  const normalizedTopic = normalizeTopicKey(topic);

  const khanTopicRoutes: Array<{ pattern: RegExp; url: string }> = [
    {
      pattern: /\blinear equations?\b|\bone variable equations?\b/,
      url: "https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:one-variable-linear-equations",
    },
    {
      pattern: /\bquadratic equations?\b|\bquadratics?\b/,
      url: "https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:quadratics",
    },
    {
      pattern: /\bphotosynthesis\b/,
      url: "https://www.khanacademy.org/science/biology/photosynthesis-in-plants",
    },
    {
      pattern: /\bderivative|derivatives\b/,
      url: "https://www.khanacademy.org/math/calculus-1/cs1-differentiation",
    },
    {
      pattern: /\bintegral|integration\b/,
      url: "https://www.khanacademy.org/math/calculus-1/cs1-integration",
    },
    {
      pattern: /\bstoichiometry\b/,
      url: "https://www.khanacademy.org/science/chemistry/chemical-reactions-stoichiome",
    },
    {
      pattern: /\bprobability\b/,
      url: "https://www.khanacademy.org/math/statistics-probability/probability-library",
    },
  ];

  const directMatch = khanTopicRoutes.find(({ pattern }) =>
    pattern.test(normalizedTopic)
  );

  if (directMatch) {
    return directMatch.url;
  }

  return `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(
    topic
  )}`;
}

// Builds a curated set of real, safe, topic-specific resource links.
function buildResourceLinks(topic: string, courseName: string): ResourceLink[] {
  const cleanTopic = topic.trim();
  const trimmedCourse = (courseName || "").trim();
  const topicWithCourseContext = trimmedCourse
    ? `${cleanTopic} ${trimmedCourse}`
    : cleanTopic;

  const encodedTopicOnly = encodeURIComponent(cleanTopic);
  const encodedTopicWithCourse = encodeURIComponent(topicWithCourseContext);
  const isApCourse = /\bap\b/i.test(trimmedCourse);

  const links: ResourceLink[] = [
    {
      label: "Khan Academy",
      url: resolveKhanAcademyUrl(cleanTopic),
    },
    {
      label: "YouTube",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${topicWithCourseContext} lesson walkthrough`
      )}`,
    },
    {
      label: "Quizlet Flashcards",
      url: `https://quizlet.com/search?query=${encodedTopicWithCourse}&type=sets`,
    },
    {
      label: "Wikipedia",
      url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodedTopicOnly}`,
    },
  ];

  if (isApCourse) {
    links.push({
      label: "AP Students (College Board)",
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `site:apstudents.collegeboard.org ${cleanTopic}`
      )}`,
    });
  } else {
    links.push({
      label: "Google Scholar",
      url: `https://scholar.google.com/scholar?q=${encodedTopicWithCourse}`,
    });
  }

  return links;
}

// Builds a personalized 3-day study plan.
function buildStudyPlan(weakTopics: WeakTopic[]): StudyDay[] {
  if (weakTopics.length === 0) {
    return [
      {
        day: 1,
        title: "Light Review",
        tasks: [
          "Skim back through your notes for this deck once, top to bottom.",
          "Note any part that felt slightly shaky, even if you got it right.",
        ],
      },
      {
        day: 2,
        title: "Self-Test",
        tasks: [
          "Quiz yourself out loud on 5-10 key facts from your notes without looking.",
          "Write down anything you hesitated on.",
        ],
      },
      {
        day: 3,
        title: "Stay Sharp",
        tasks: [
          "Replay this StudyClash deck to confirm you're still at 85%+ accuracy.",
          "If you have newer notes, generate a fresh deck to keep testing yourself.",
        ],
      },
    ];
  }

  const topWeakTopic = weakTopics[0].topic;

  return [
    {
      day: 1,
      title: "Understand the Gaps",
      tasks: [
        "Reread the explanations for every question you missed in the Answer Review above.",
        "Watch or read one resource link for your weakest topic.",
        "Redo the missed questions from memory, without peeking at the explanations.",
      ],
    },
    {
      day: 2,
      title: "Targeted Practice",
      tasks: [
        `Find and work through 10-15 practice questions specifically on "${topWeakTopic}".`,
        "Create a one-page mini summary sheet covering your weak topics in your own words.",
      ],
    },
    {
      day: 3,
      title: "Retest & Confirm",
      tasks: [
        "Replay this StudyClash deck.",
        "Aim for 85%+ accuracy this time.",
        "Review anything you still miss, one more time, before moving on.",
      ],
    },
  ];
}

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
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-10 pb-28 sm:px-6 sm:py-14 sm:pb-24 md:pb-20">
        {children}
      </div>
    </main>
  );
}

function buildChallengeMessage(deckTitle: string, accuracyPercent: number): string {
  return `I scored ${accuracyPercent}% on ${deckTitle}. Can you beat me?`;
}

function safeTrackEvent(name: AnalyticsEventName, payload?: Record<string, unknown>) {
  try {
    trackEvent(name, payload);
  } catch {
    // Analytics must never block the UI flow.
  }
}

function getConfidenceStyle(confidence: MistakeBreakdown["confidenceRating"]): {
  border: string;
  bg: string;
  text: string;
} {
  if (confidence === "careless_mistake" || confidence === "careless_error") {
    return {
      border: "border-amber-400/30",
      bg: "bg-amber-500/10",
      text: "text-amber-200",
    };
  }

  if (confidence === "concept_gap") {
    return {
      border: "border-red-400/30",
      bg: "bg-red-500/10",
      text: "text-red-200",
    };
  }

  if (confidence === "slow_response" || confidence === "speed_trap") {
    return {
      border: "border-cyan-400/30",
      bg: "bg-cyan-500/10",
      text: "text-cyan-200",
    };
  }

  if (confidence === "misread_question") {
    return {
      border: "border-orange-400/30",
      bg: "bg-orange-500/10",
      text: "text-orange-200",
    };
  }

  if (confidence === "repeated_weakness") {
    return {
      border: "border-rose-400/30",
      bg: "bg-rose-500/10",
      text: "text-rose-200",
    };
  }

  if (confidence === "almost_mastered") {
    return {
      border: "border-emerald-400/30",
      bg: "bg-emerald-500/10",
      text: "text-emerald-200",
    };
  }

  return {
    border: "border-fuchsia-400/30",
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-200",
  };
}

export default function ResultsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<Match | null>(null);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Weak topic report state.
  const [weakTopics, setWeakTopics] = useState<WeakTopic[] | null>(null);
  const [hasAnswerData, setHasAnswerData] = useState(false);
  const [answerDataMessage, setAnswerDataMessage] = useState<string | null>(null);

  // Answer review state — every question paired with what was selected.
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);

  // Report Bad Question state, keyed by question_id
  const [reportStates, setReportStates] = useState<
    Record<string, ReportState>
  >({});

  const [deckLeaderboard, setDeckLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [battleProgress, setBattleProgress] = useState<BattleProgress | null>(null);
  const [clashPathReport, setClashPathReport] = useState<ClashPathReport | null>(null);
  const [isClashPathLoading, setIsClashPathLoading] = useState(false);
  const [mistakeHistory, setMistakeHistory] = useState<MistakeHistoryStats>({
    topicMisses: {},
    selectedOptionRepeats: {},
  });
  const [isSavingMistakes, setIsSavingMistakes] = useState(false);
  const [showVictoryBurst, setShowVictoryBurst] = useState(false);
  const challengeFromMatchId = searchParams.get("challengeFrom");
  const challengeScoreParam = searchParams.get("challengeScore");
  const modeParam = (searchParams.get("mode") || "").toLowerCase();
  const isBossBattle = modeParam === "boss";
  const isRivalBattle = modeParam === "rival";
  const bossName = searchParams.get("bossName") || "Boss Battle";
  const bossTargetScore = Number(searchParams.get("bossTargetScore") || "0");
  const bossTargetAccuracy = Number(searchParams.get("bossTargetAccuracy") || "0");
  const bossWeakTopicsFromParams = parseDelimitedList(searchParams.get("bossWeakTopics"));
  const bossStrongTopicsFromParams = parseDelimitedList(searchParams.get("bossStrongTopics"));
  const nextBossFromParams = searchParams.get("nextBoss") || "";
  const rivalName = searchParams.get("rivalName") || "Study Rival";
  const rivalRank = searchParams.get("rivalRank") || "Rookie";
  const rivalScore = Number(searchParams.get("rivalScore") || "0");
  const rivalAccuracy = Number(searchParams.get("rivalAccuracy") || "0");
  const rivalTargetAccuracy = Number(searchParams.get("rivalTargetAccuracy") || "0");
  const rivalWeakTopics = parseDelimitedList(searchParams.get("rivalWeakTopics"));
  const rivalStrengths = parseDelimitedList(searchParams.get("rivalStrengths"));
  const challengeBaseScore =
    challengeScoreParam !== null && challengeScoreParam !== ""
      ? Number(challengeScoreParam)
      : null;
  const hasChallengeComparison =
    Boolean(challengeFromMatchId) &&
    challengeBaseScore !== null &&
    !Number.isNaN(challengeBaseScore);
  const hasChallengeFallback =
    Boolean(challengeFromMatchId) && !hasChallengeComparison;

  useEffect(() => {
    async function loadResults() {
      setIsLoading(true);
      setLoadError(null);
      setMatch(null);
      setDeck(null);
      setReviewItems([]);
      setWeakTopics(null);
      setHasAnswerData(false);
      setAnswerDataMessage(null);
      setBattleProgress(null);
      setClashPathReport(null);
      setMistakeHistory({ topicMisses: {}, selectedOptionRepeats: {} });

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

      const normalizedMatch = coerceMatch(matchData);
      if (!normalizedMatch) {
        setLoadError(
          "This match is missing required result data and cannot be displayed safely."
        );
        setIsLoading(false);
        return;
      }

      // 2. Load the related deck
      const { data: deckData, error: deckError } = await supabase
        .from("decks")
        .select("*")
        .eq("id", normalizedMatch.deck_id)
        .single();

      if (deckError || !deckData) {
        setLoadError(deckError?.message || "This deck could not be found.");
        setIsLoading(false);
        return;
      }

      const normalizedDeck = coerceDeck(deckData);
      if (!normalizedDeck) {
        setLoadError(
          "This deck is missing required data and cannot be displayed safely."
        );
        setIsLoading(false);
        return;
      }

      setMatch(normalizedMatch);
      setDeck(normalizedDeck);

      // Track that this results page was actually viewed, once the
      // match/deck have loaded successfully.
      try {
        trackEvent("page_view", {
          page: "results",
          matchId,
          deckId: normalizedMatch.deck_id,
        });
      } catch {
        // Analytics should never block results rendering.
      }

      // 3. Load per-question answers from the durable match_answers table.
      // This works even after a refresh, a closed tab, or logging out and
      // back in, since it's keyed by match_id in the database rather than
      // sessionStorage or any other temporary frontend state.
      try {
        const { data: matchAnswersData, error: matchAnswersError } =
          await supabase
            .from("match_answers")
            .select("question_id, selected_answer, is_correct, response_time_ms")
            .eq("match_id", matchId);

        if (matchAnswersError) {
          console.error(
            "Failed to load match answers:",
            matchAnswersError.message
          );
          setAnswerDataMessage(
            "We could not load the answer-by-answer review for this match. Your final score is still available."
          );
        }

        if (
          !matchAnswersError &&
          matchAnswersData &&
          matchAnswersData.length > 0
        ) {
          const { data: questionsData, error: questionsError } = await supabase
            .from("questions")
            .select("*")
            .eq("deck_id", normalizedMatch.deck_id);

          if (questionsError || !questionsData || questionsData.length === 0) {
            setAnswerDataMessage(
              "We found this match, but the saved question review data is incomplete."
            );
          } else {
            const questionById = new Map<string, Question>(
              (questionsData as Question[]).map((q) => [q.id, q])
            );

            const items: ReviewItem[] = (
              matchAnswersData as MatchAnswerRow[]
            )
              .map((answer) => {
                const question = questionById.get(answer.question_id);
                if (!question) return null;
                return {
                  question,
                  selectedAnswer: answer.selected_answer,
                  isCorrect: answer.is_correct,
                  responseTimeMs: answer.response_time_ms || 0,
                };
              })
              .filter((item): item is ReviewItem => item !== null);

            if (items.length === 0) {
              setAnswerDataMessage(
                "We found this match, but the saved answer review details are incomplete."
              );
            } else if (items.length < matchAnswersData.length) {
              setAnswerDataMessage(
                "Some question details were unavailable, so the answer review below is partial."
              );
            }

            setReviewItems(items);

            // Build the Weak Topic Report from the same data
            const missedAnswers = (
              matchAnswersData as MatchAnswerRow[]
            ).filter((a) => !a.is_correct);

            if (missedAnswers.length === 0) {
              setHasAnswerData(true);
              setWeakTopics([]);
            } else {
              const missedCountByTopic = new Map<string, number>();

              for (const answer of missedAnswers) {
                const topic =
                  questionById.get(answer.question_id)?.topic || "General";
                missedCountByTopic.set(
                  topic,
                  (missedCountByTopic.get(topic) || 0) + 1
                );
              }

              const topicList: WeakTopic[] = Array.from(
                missedCountByTopic.entries()
              )
                .map(([topic, missedCount]) => ({
                  topic,
                  missedCount,
                  message: buildImprovementMessage(topic, missedCount),
                }))
                .sort((a, b) => b.missedCount - a.missedCount);

              setHasAnswerData(true);
              setWeakTopics(topicList);
            }
          }
        } else if (!matchAnswersError) {
          setAnswerDataMessage(
            "This match does not have saved answer-by-answer review data. Your score and leaderboard placement are still available."
          );
        }
      } catch (err) {
        // If the query fails for any reason, skip these sections silently
        // rather than breaking the whole results page.
        console.error("Failed to load match answers:", err);
        setAnswerDataMessage(
          "We could not load the detailed answer review for this match, but the score summary is still available."
        );
      }

      setIsLoading(false);
    }

    if (matchId) {
      loadResults();
    }
  }, [matchId]);

  useEffect(() => {
    async function loadLeaderboard() {
      if (!deck) return;

      setIsLeaderboardLoading(true);

      const { data, error } = await supabase
        .from("matches")
        .select(
          "id, player_name, score, correct_answers, total_questions, time_taken_seconds"
        )
        .eq("deck_id", deck.id)
        .order("score", { ascending: false })
        .order("time_taken_seconds", { ascending: true })
        .limit(5);

      if (!error && data) {
        setDeckLeaderboard(data as LeaderboardEntry[]);
      }

      setIsLeaderboardLoading(false);
    }

    loadLeaderboard();
  }, [deck]);

  useEffect(() => {
    if (!match || !deck) return;

    const storageKey = getProgressStorageKey(match);
    const snapshot = loadProgressSnapshot(storageKey);
    const currentAccuracy = calculateAccuracy(
      match.correct_answers,
      match.total_questions
    );
    const averageResponseTimeMs =
      reviewItems.length > 0
        ? Math.round(
            reviewItems.reduce(
              (sum, item) => sum + (item.responseTimeMs || 0),
              0
            ) / reviewItems.length
          )
        : match.total_questions > 0
          ? Math.round((match.time_taken_seconds * 1000) / match.total_questions)
          : 0;
    const weakTopic = hasAnswerData ? weakTopics?.[0]?.topic || null : null;
    const previousBest = snapshot.bestScoresByDeck[deck.id] || null;
    const previousAttempt = snapshot.lastAttemptsByDeck[deck.id] || null;
    const alreadyAwarded = snapshot.awardedMatchIds.includes(match.id);
    const baseXpEarned = calculateBattleXp({
      accuracyPercent: currentAccuracy,
      averageResponseTimeMs,
      totalQuestions: match.total_questions,
      completedQuestions:
        reviewItems.length > 0 ? reviewItems.length : match.total_questions,
    });
    const targetScore = Number.isFinite(bossTargetScore) ? bossTargetScore : 0;
    const targetAccuracy = Number.isFinite(bossTargetAccuracy) ? bossTargetAccuracy : 0;
    const didDefeatBoss =
      isBossBattle &&
      match.score >= targetScore &&
      currentAccuracy >= targetAccuracy;
    const bossAlreadyAwarded = snapshot.bossAwardedMatchIds.includes(match.id);
    const bossXpBonus = didDefeatBoss && !bossAlreadyAwarded ? BOSS_BONUS_XP : 0;
    const xpEarned = baseXpEarned + bossXpBonus;
    const bossBadgeName = didDefeatBoss
      ? `${bossName} Slayer`
      : "";

    const nextSnapshot: ProgressSnapshot = {
      totalXp: alreadyAwarded ? snapshot.totalXp : snapshot.totalXp + xpEarned,
      awardedMatchIds: alreadyAwarded
        ? snapshot.awardedMatchIds
        : [...snapshot.awardedMatchIds, match.id],
      bestScoresByDeck: { ...snapshot.bestScoresByDeck },
      lastAttemptsByDeck: { ...snapshot.lastAttemptsByDeck },
      bossAwardedMatchIds:
        didDefeatBoss && !bossAlreadyAwarded
          ? [...snapshot.bossAwardedMatchIds, match.id]
          : snapshot.bossAwardedMatchIds,
      bossBadges:
        didDefeatBoss && bossBadgeName && !snapshot.bossBadges.includes(bossBadgeName)
          ? [...snapshot.bossBadges, bossBadgeName]
          : snapshot.bossBadges,
    };

    const shouldUpdateBest =
      !previousBest || match.score > previousBest.score;

    const currentAttempt: DeckAttemptRecord = {
      score: match.score,
      accuracy: currentAccuracy,
      matchId: match.id,
      timestamp: new Date().toISOString(),
    };

    nextSnapshot.lastAttemptsByDeck[deck.id] = currentAttempt;

    if (shouldUpdateBest) {
      nextSnapshot.bestScoresByDeck[deck.id] = currentAttempt;
    }

    saveProgressSnapshot(storageKey, nextSnapshot);

    const levelInfo = calculateLevel(nextSnapshot.totalXp);
    const improvementPercent = previousAttempt
      ? currentAccuracy - previousAttempt.accuracy
      : null;

    void Promise.resolve().then(() => {
      setBattleProgress({
        xpEarned,
        totalXp: nextSnapshot.totalXp,
        level: levelInfo.level,
        xpInLevel: levelInfo.xpInLevel,
        xpToNextLevel: levelInfo.xpToNextLevel,
        previousBestScore: previousBest?.score ?? null,
        newPersonalBest: shouldUpdateBest,
        improvementPercent,
        progressMessage: buildProgressMessage({
          improvementPercent,
          weakestTopic: weakTopic,
          newPersonalBest: shouldUpdateBest,
        }),
        weakestTopic: weakTopic,
      });
    });
  }, [
    match,
    deck,
    hasAnswerData,
    reviewItems,
    weakTopics,
    isBossBattle,
    bossTargetScore,
    bossTargetAccuracy,
    bossName,
  ]);

  useEffect(() => {
    if (!match || !deck) return;

    const currentMatch = match;
    const currentDeck = deck;

    let cancelled = false;

    async function buildClashPath() {
      setIsClashPathLoading(true);

      const currentQuestions: ClashPathQuestionResult[] = reviewItems.map((item) => ({
        topic: item.question.topic || "General",
        difficulty: (item.question.difficulty || "").toLowerCase(),
        isCorrect: item.isCorrect,
        responseTimeMs: item.responseTimeMs || 0,
        selectedAnswer: item.selectedAnswer,
        correctAnswer: item.question.correct_answer,
      }));

      const currentAverageResponseTimeMs =
        currentQuestions.length > 0
          ? Math.round(
              currentQuestions.reduce(
                (sum, question) => sum + question.responseTimeMs,
                0
              ) / currentQuestions.length
            )
          : currentMatch.total_questions > 0
            ? Math.round(
                (currentMatch.time_taken_seconds * 1000) /
                  currentMatch.total_questions
              )
            : 0;

      const currentAttempt: ClashPathAttempt = {
        accuracyPercent: calculateAccuracy(
          currentMatch.correct_answers,
          currentMatch.total_questions
        ),
        avgResponseTimeMs: currentAverageResponseTimeMs,
        questions: currentQuestions,
      };

      try {
        const { data: previousMatches, error: previousMatchesError } = await supabase
          .from("matches")
          .select("id, correct_answers, total_questions, time_taken_seconds, created_at")
          .eq("deck_id", currentDeck.id)
          .eq("player_name", currentMatch.player_name)
          .neq("id", currentMatch.id)
          .order("created_at", { ascending: true })
          .limit(8);

        if (previousMatchesError || !previousMatches || previousMatches.length === 0) {
          if (!cancelled) {
            setClashPathReport(
              buildClashPathReport({
                deckId: currentDeck.id,
                currentAttempt,
                historicalAttempts: [],
              })
            );
          }
          return;
        }

        const previousMatchIds = previousMatches.map((entry) => entry.id);

        const [questionResult, previousAnswerResult] = await Promise.all([
          supabase
            .from("questions")
            .select("id, topic, difficulty, correct_answer")
            .eq("deck_id", currentDeck.id),
          supabase
            .from("match_answers")
            .select("match_id, question_id, selected_answer, is_correct, response_time_ms")
            .in("match_id", previousMatchIds),
        ]);

        if (questionResult.error || previousAnswerResult.error) {
          if (!cancelled) {
            setClashPathReport(
              buildClashPathReport({
                deckId: currentDeck.id,
                currentAttempt,
                historicalAttempts: [],
              })
            );
          }
          return;
        }

        const questionById = new Map(
          (questionResult.data || []).map((question) => [question.id, question])
        );

        const groupedAnswers = new Map<string, ClashPathQuestionResult[]>();

        for (const answer of (previousAnswerResult.data || []) as HistoricalMatchAnswerRow[]) {
          const questionMeta = questionById.get(answer.question_id);
          if (!questionMeta) continue;

          const bucket = groupedAnswers.get(answer.match_id) || [];
          bucket.push({
            topic: questionMeta.topic || "General",
            difficulty: (questionMeta.difficulty || "").toLowerCase(),
            isCorrect: answer.is_correct,
            responseTimeMs: answer.response_time_ms || 0,
            selectedAnswer: answer.selected_answer,
            correctAnswer: questionMeta.correct_answer,
          });
          groupedAnswers.set(answer.match_id, bucket);
        }

        const historicalAttempts: ClashPathAttempt[] = (
          previousMatches as HistoricalMatchRow[]
        )
          .map((entry) => {
            const questions = groupedAnswers.get(entry.id) || [];
            const avgResponseTimeMs =
              questions.length > 0
                ? Math.round(
                    questions.reduce(
                      (sum, question) => sum + question.responseTimeMs,
                      0
                    ) / questions.length
                  )
                : entry.total_questions > 0
                  ? Math.round((entry.time_taken_seconds * 1000) / entry.total_questions)
                  : 0;

            return {
              accuracyPercent: calculateAccuracy(
                entry.correct_answers,
                entry.total_questions
              ),
              avgResponseTimeMs,
              createdAt: entry.created_at,
              questions,
            };
          })
          .filter((entry) => entry.questions.length > 0);

        if (!cancelled) {
          setClashPathReport(
            buildClashPathReport({
              deckId: currentDeck.id,
              currentAttempt,
              historicalAttempts,
            })
          );
        }
      } finally {
        if (!cancelled) {
          setIsClashPathLoading(false);
        }
      }
    }

    void buildClashPath();

    return () => {
      cancelled = true;
    };
  }, [deck, match, reviewItems]);

  useEffect(() => {
    if (!deck || !match) return;

    const currentDeck = deck;
    const currentMatch = match;

    let cancelled = false;

    async function loadMistakeHistory() {
      try {
        const response = await fetch(
          `/api/mistake-breakdown?deckId=${encodeURIComponent(
            currentDeck.id
          )}&playerName=${encodeURIComponent(currentMatch.player_name)}`
        );
        const data = await response.json();

        if (cancelled) return;

        setMistakeHistory({
          topicMisses:
            data?.topicMisses && typeof data.topicMisses === "object"
              ? data.topicMisses
              : {},
          selectedOptionRepeats:
            data?.selectedOptionRepeats &&
            typeof data.selectedOptionRepeats === "object"
              ? data.selectedOptionRepeats
              : {},
        });
      } catch {
        if (cancelled) return;
        setMistakeHistory({ topicMisses: {}, selectedOptionRepeats: {} });
      }
    }

    void loadMistakeHistory();

    return () => {
      cancelled = true;
    };
  }, [deck, match]);

  const mistakeBreakdowns = useMemo(() => {
    if (!deck || reviewItems.length === 0) return [];

    return buildMistakeBreakdowns({
      deckId: deck.id,
      reviewItems: reviewItems.map((item) => ({
        questionId: item.question.id,
        questionText: item.question.question_text,
        topic: item.question.topic,
        difficulty: item.question.difficulty,
        selectedAnswer: item.selectedAnswer,
        correctAnswer: item.question.correct_answer,
        explanation: item.question.explanation,
        responseTimeMs: item.responseTimeMs || 0,
        isCorrect: item.isCorrect,
      })),
      history: mistakeHistory,
    });
  }, [deck, reviewItems, mistakeHistory]);

  useEffect(() => {
    if (!deck || !match || mistakeBreakdowns.length === 0) return;

    const currentDeck = deck;
    const currentMatch = match;

    let cancelled = false;

    async function saveMistakeBreakdowns() {
      setIsSavingMistakes(true);

      try {
        await fetch("/api/mistake-breakdown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckId: currentDeck.id,
            matchId: currentMatch.id,
            playerName: currentMatch.player_name,
            records: mistakeBreakdowns,
          }),
        });
      } finally {
        if (!cancelled) {
          setIsSavingMistakes(false);
        }
      }
    }

    void saveMistakeBreakdowns();

    return () => {
      cancelled = true;
    };
  }, [deck, match, mistakeBreakdowns]);

  useEffect(() => {
    if (!match) return;

    const accuracy = calculateAccuracy(match.correct_answers, match.total_questions);
    if (accuracy < 80 && !battleProgress?.newPersonalBest) return;

    setShowVictoryBurst(true);
    const timer = setTimeout(() => setShowVictoryBurst(false), 1200);
    return () => clearTimeout(timer);
  }, [match, battleProgress?.newPersonalBest]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleCopyLink = async () => {
    if (!deck || !match) return;

    const accuracyPercent = Math.round(
      (match.correct_answers / match.total_questions) * 100
    );
    const challengeLink = `${window.location.origin}/challenge/${match.id}`;
    const shareMessage = `${buildChallengeMessage(deck.title, accuracyPercent)} ${challengeLink}`;

    try {
      await navigator.clipboard.writeText(shareMessage);
      setLinkCopied(true);
      safeTrackEvent("challenge_link_copied", {
        matchId: match.id,
        deckId: deck.id,
        accuracyPercent,
      });
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setLinkCopied(false);
      setLoadError("Could not copy challenge message. Please copy the challenge link manually.");
      safeTrackEvent("challenge_link_copy_failed", {
        matchId: match.id,
        deckId: deck.id,
      });
    }
  };

  // Get (or create a default) report state for a given question
  const getReportState = (questionId: string): ReportState => {
    return (
      reportStates[questionId] || {
        isFormOpen: false,
        selectedReason: REPORT_REASONS[0],
        isSubmitting: false,
        isSubmitted: false,
        error: null,
      }
    );
  };

  const updateReportState = (
    questionId: string,
    updates: Partial<ReportState>
  ) => {
    setReportStates((prev) => ({
      ...prev,
      [questionId]: { ...getReportState(questionId), ...updates },
    }));
  };

  const handleOpenReportForm = (questionId: string) => {
    updateReportState(questionId, { isFormOpen: true, error: null });
  };

  const handleCancelReport = (questionId: string) => {
    updateReportState(questionId, { isFormOpen: false, error: null });
  };

  const handleSubmitReport = async (questionId: string) => {
    if (!deck) return;

    const currentState = getReportState(questionId);
    updateReportState(questionId, { isSubmitting: true, error: null });

    const { error } = await supabase.from("question_reports").insert({
      question_id: questionId,
      deck_id: deck.id,
      reason: currentState.selectedReason,
    });

    if (error) {
      updateReportState(questionId, {
        isSubmitting: false,
        error: error.message,
      });
      return;
    }

    updateReportState(questionId, {
      isSubmitting: false,
      isSubmitted: true,
      isFormOpen: false,
    });

    trackEvent("question_report_submitted", {
      questionId,
      deckId: deck.id,
      reason: currentState.selectedReason,
    });
  };

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
        <div className="w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-center sm:p-6">
          <h1 className="text-lg font-bold text-red-300">
            Couldn&apos;t load these results
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

  // ---------- Results ----------
  const accuracyPercent = calculateAccuracy(
    match.correct_answers,
    match.total_questions
  );
  const wrongAnswers = match.total_questions - match.correct_answers;
  const rank = getRank(accuracyPercent);

  const topicStats = buildTopicStats(reviewItems);
  const bestTopics = [...topicStats]
    .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)
    .slice(0, 3);
  const weakestTopics = [...topicStats]
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)
    .slice(0, 3);

  const topStudyTopics = (weakTopics || []).slice(0, 4);
  const studyPlan = buildStudyPlan(weakTopics || []);

  const currentAccuracyPercent = accuracyPercent;
  const rivalRanks: Array<"Rookie" | "Grinder" | "Scholar" | "Genius" | "Legend"> = [
    "Rookie",
    "Grinder",
    "Scholar",
    "Genius",
    "Legend",
  ];
  const rivalRankIndex = rivalRanks.findIndex((rankName) => rankName === rivalRank);
  const nextRivalRank =
    rivalRankIndex >= 0 && rivalRankIndex < rivalRanks.length - 1
      ? rivalRanks[rivalRankIndex + 1]
      : null;
  const didBeatRival =
    isRivalBattle &&
    (match.score > rivalScore ||
      (match.score === rivalScore && currentAccuracyPercent >= rivalAccuracy));
  const rivalWinLoss = didBeatRival ? "Win" : "Loss";
  const rivalGap = match.score - rivalScore;
  const rivalBetterAt =
    rivalWeakTopics.length > 0
      ? rivalWeakTopics.slice(0, 3)
      : (weakTopics || []).slice(0, 3).map((topic) => topic.topic);
  const studentNeedsImprove =
    (weakTopics || []).slice(0, 3).map((topic) => topic.topic).length > 0
      ? (weakTopics || []).slice(0, 3).map((topic) => topic.topic)
      : ["Consistency", "Hard-question accuracy"];
  const unlockNextRivalMessage = nextRivalRank
    ? `Reach ${Math.max(65, currentAccuracyPercent + 4)}%+ accuracy over your next few rival runs to unlock ${nextRivalRank}.`
    : "You have unlocked every rival rank. Keep rematching to dominate the leaderboard.";
  const resolvedBossWeakTopics =
    bossWeakTopicsFromParams.length > 0
      ? bossWeakTopicsFromParams
      : (weakTopics || []).map((topic) => topic.topic).slice(0, 4);
  const resolvedBossStrongTopics =
    bossStrongTopicsFromParams.length > 0
      ? bossStrongTopicsFromParams
      : bestTopics.map((topic) => topic.topic).slice(0, 4);
  const hasBossTargets = bossTargetScore > 0 && bossTargetAccuracy > 0;
  const didDefeatBoss =
    isBossBattle &&
    hasBossTargets &&
    match.score >= bossTargetScore &&
    currentAccuracyPercent >= bossTargetAccuracy;
  const bossMistakeDnaStats = buildBossMistakeDnaStats(mistakeBreakdowns);
  const bossMasteryGained = didDefeatBoss
    ? Math.max(
        6,
        Math.round(
          (currentAccuracyPercent - Math.max(0, bossTargetAccuracy - 15)) / 2
        )
      )
    : Math.max(
        2,
        Math.round(
          (currentAccuracyPercent - Math.max(0, bossTargetAccuracy - 30)) / 6
        )
      );
  const bossPracticeTargets = (weakTopics || []).slice(0, 3).map((topic) => topic.topic);
  const nextRecommendedBoss =
    nextBossFromParams ||
    `${deck.course_name} Boss: ${(weakTopics || [])[0]?.topic || bestTopics[0]?.topic || "Mixed Mastery"}`;
  const challengeGap =
    hasChallengeComparison && challengeBaseScore !== null
      ? currentAccuracyPercent - challengeBaseScore
      : null;
  const challengePreviewMessage = buildChallengeMessage(
    deck.title,
    currentAccuracyPercent
  );
  const longestStreak = reviewItems.reduce(
    (state, item) => {
      const nextCurrent = item.isCorrect ? state.current + 1 : 0;
      return {
        current: nextCurrent,
        best: Math.max(state.best, nextCurrent),
      };
    },
    { current: 0, best: 0 }
  ).best;
  const avgResponseMs =
    reviewItems.length > 0
      ? Math.round(
          reviewItems.reduce((sum, item) => sum + (item.responseTimeMs || 0), 0) /
            reviewItems.length
        )
      : 0;
  const unlockedHighlights = [
    currentAccuracyPercent >= 80 ? "Champion Accuracy" : null,
    currentAccuracyPercent === 100 ? "Flawless Run" : null,
    longestStreak >= 5 ? "Heat Streak" : null,
    avgResponseMs > 0 && avgResponseMs < 6500 ? "Speed Focus" : null,
    battleProgress?.newPersonalBest ? "New Personal Best" : null,
    didDefeatBoss ? "Boss Slayer" : null,
    didBeatRival ? "Rival Takedown" : null,
  ].filter((value): value is string => Boolean(value));
  const victoryTone =
    currentAccuracyPercent >= 90
      ? "Elite"
      : currentAccuracyPercent >= 75
        ? "Strong"
        : "Building";
  const weakTopicQueryValue =
    weakTopics && weakTopics.length > 0
      ? encodeURIComponent(weakTopics.map((topic) => topic.topic).join(","))
      : "";
  const missedTopicQueryValue = encodeURIComponent(
    Array.from(
      new Set(
        reviewItems
          .filter((item) => !item.isCorrect)
          .map((item) => item.question.topic)
          .filter(Boolean)
      )
    ).join(",")
  );
  const coachWeakTopics = (weakTopics || []).map((topic) => topic.topic);
  const coachMissedQuestions = reviewItems
    .filter((item) => !item.isCorrect)
    .map((item) => ({
      questionText: item.question.question_text,
      selectedAnswer: item.selectedAnswer,
      correctAnswer: item.question.correct_answer,
      topic: item.question.topic,
      explanation: item.question.explanation,
    }));
  const coachMistakeDna = mistakeBreakdowns.map((item) => ({
    questionId: item.questionId,
    topic: item.topic,
    selectedAnswer: item.selectedAnswer,
    correctAnswer: item.correctAnswer,
    misunderstoodConcept: item.misunderstoodConcept,
    mistakeType: item.confidenceRating,
  }));
  const coachMasteryProgress = clashPathReport
    ? clashPathReport.topicInsights.slice(0, 6).map((topic) => ({
        label: topic.topic,
        value: topic.masteryPercent,
        details: `Status: ${topic.status}`,
      }))
    : [];
  const coachPreviousRematches = Math.max(0, deckLeaderboard.length - 1);

  return (
    <Background>
      <div className="relative w-full max-w-5xl">
        <ConfettiBurst show={showVictoryBurst} />
        {/* Badge */}
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          BATTLE COMPLETE
        </div>

        {/* Title */}
        <h1 className="break-words text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Nice Work, {match.player_name}!
          </span>
        </h1>
        <p className="mt-3 break-words text-center text-sm text-white/50">
          {deck.title} · {deck.course_name}
        </p>

        <div className="mt-5 rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/[0.12] via-black/35 to-fuchsia-500/[0.1] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-200">
                Victory Screen
              </p>
              <p className="mt-1 text-base font-black text-white">
                {victoryTone} performance · {currentAccuracyPercent}% accuracy
              </p>
              <p className="mt-1 text-xs text-white/70">
                Longest streak {longestStreak} · Avg response {avgResponseMs > 0 ? `${(avgResponseMs / 1000).toFixed(1)}s` : "n/a"}
              </p>
            </div>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-emerald-200">
              {rank.label}
            </span>
          </div>

          {unlockedHighlights.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {unlockedHighlights.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-100"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

        {isBossBattle && (
          <div className="mt-5 rounded-2xl border border-fuchsia-400/25 bg-gradient-to-r from-fuchsia-500/[0.1] via-black/30 to-cyan-500/[0.08] p-4 text-left backdrop-blur-sm sm:mt-6 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-fuchsia-200">
                  Boss Battle Result
                </p>
                <h2 className="mt-1 text-lg font-black text-white sm:text-xl">
                  {bossName}
                </h2>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  didDefeatBoss
                    ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                    : "border-red-400/30 bg-red-500/15 text-red-200"
                }`}
              >
                {didDefeatBoss ? "Boss Defeated" : "Boss Survived"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Score</p>
                <p className="mt-1 text-sm font-bold text-white">{match.score}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Accuracy</p>
                <p className="mt-1 text-sm font-bold text-white">{currentAccuracyPercent}%</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Time</p>
                <p className="mt-1 text-sm font-bold text-white">{formatTime(match.time_taken_seconds)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Mastery Gained</p>
                <p className="mt-1 text-sm font-bold text-cyan-200">+{bossMasteryGained}%</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-red-400/20 bg-red-500/[0.08] px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-200">Weak Topics</p>
                <p className="mt-1 text-xs text-white/80">
                  {resolvedBossWeakTopics.length > 0 ? resolvedBossWeakTopics.join(" · ") : "No weak topics recorded."}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.08] px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Strong Topics</p>
                <p className="mt-1 text-xs text-white/80">
                  {resolvedBossStrongTopics.length > 0 ? resolvedBossStrongTopics.join(" · ") : "No strong topics recorded."}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/55">Mistake DNA</p>
              <p className="mt-1 text-xs text-white/80">
                {bossMistakeDnaStats.length > 0
                  ? bossMistakeDnaStats.map((item) => `${item.type}: ${item.count}`).join(" · ")
                  : "No mistake DNA captured for this boss run."}
              </p>
            </div>

            {!didDefeatBoss && (
              <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/[0.08] px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200">
                  Practice Before Retry
                </p>
                <p className="mt-1 text-xs text-white/85">
                  Focus on {bossPracticeTargets.length > 0 ? bossPracticeTargets.join(" and ") : "your weakest concepts"}, then run one weak-topic rematch and one quick-check before re-challenging this boss.
                </p>
              </div>
            )}

            {didDefeatBoss && (
              <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.08] px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                  Victory Rewards
                </p>
                <p className="mt-1 text-xs text-white/85">
                  +{BOSS_BONUS_XP} bonus XP, boss badge unlocked, and mastery progress advanced.
                </p>
              </div>
            )}

            <p className="mt-3 text-xs text-cyan-100/90">
              Next recommended boss: {nextRecommendedBoss}
            </p>
          </div>
        )}

        {isRivalBattle && (
          <div className="mt-5 rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-cyan-500/[0.1] via-black/30 to-fuchsia-500/[0.08] p-4 text-left backdrop-blur-sm sm:mt-6 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">
                  Study Rival Result
                </p>
                <h2 className="mt-1 text-lg font-black text-white sm:text-xl">
                  {rivalName} · {rivalRank}
                </h2>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  didBeatRival
                    ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                    : "border-red-400/30 bg-red-500/15 text-red-200"
                }`}
              >
                {rivalWinLoss}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Student Score</p>
                <p className="mt-1 text-sm font-bold text-white">{match.score}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">AI Rival Score</p>
                <p className="mt-1 text-sm font-bold text-white">{rivalScore}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Score Gap</p>
                <p className="mt-1 text-sm font-bold text-white">{rivalGap >= 0 ? "+" : ""}{rivalGap}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-white/45">Rival Accuracy</p>
                <p className="mt-1 text-sm font-bold text-white">{rivalAccuracy}%</p>
              </div>
            </div>

            <p className="mt-3 text-xs text-cyan-100/90">
              Rival target accuracy: {rivalTargetAccuracy > 0 ? `${rivalTargetAccuracy}%` : "Adaptive"}
            </p>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/[0.08] px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-200">Rival Better At</p>
                <p className="mt-1 text-xs text-white/85">
                  {rivalBetterAt.length > 0 ? rivalBetterAt.join(" · ") : "No dominant rival lane detected."}
                </p>
              </div>
              <div className="rounded-lg border border-amber-400/20 bg-amber-500/[0.08] px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Improve Next</p>
                <p className="mt-1 text-xs text-white/85">{studentNeedsImprove.join(" · ")}</p>
              </div>
            </div>

            {rivalStrengths.length > 0 && (
              <p className="mt-3 text-xs text-emerald-100/90">
                Rival strengths: {rivalStrengths.join(" · ")}
              </p>
            )}

            <p className="mt-3 text-xs text-white/80">{unlockNextRivalMessage}</p>
          </div>
        )}

        {answerDataMessage && (
          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4 text-left backdrop-blur-sm sm:mt-6 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Review Data Notice
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/80 sm:text-base">
              {answerDataMessage}
            </p>
          </div>
        )}

        {hasChallengeComparison && challengeBaseScore !== null && (
          <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4 text-left backdrop-blur-sm sm:mt-6 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              Challenge Result
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-white/80 sm:text-base">
              {challengeGap !== null && challengeGap > 0
                ? `You beat the original score by ${challengeGap}%.`
                : challengeGap !== null && challengeGap < 0
                  ? `You finished ${Math.abs(challengeGap)}% behind the original score.`
                  : "You matched the original score exactly."}
            </p>
            <p className="mt-1 text-xs text-white/45">
              Original score: {challengeBaseScore}% · Your score: {currentAccuracyPercent}%
            </p>
          </div>
        )}

        {hasChallengeFallback && (
          <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4 text-left backdrop-blur-sm sm:mt-6 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              Challenge Result
            </p>
            <p className="mt-2 text-sm font-medium leading-relaxed text-white/80 sm:text-base">
              This challenge link did not include a valid score to compare against, but you can still review your run and share a fresh challenge from this result.
            </p>
          </div>
        )}

        {battleProgress && (
          <div className="mt-5 rounded-2xl border border-fuchsia-400/20 bg-black/20 p-4 backdrop-blur-sm sm:mt-6 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                  Progress Message
                </p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/80 sm:text-base">
                  {battleProgress.progressMessage}
                </p>
                <p className="mt-2 text-xs text-white/45">
                  Personal best on this deck: {battleProgress.previousBestScore == null ? "none yet" : `${battleProgress.previousBestScore} pts`}
                  {battleProgress.newPersonalBest ? " · New record!" : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-cyan-200">
                  +{battleProgress.xpEarned} XP
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-emerald-200">
                  Level {battleProgress.level}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-fuchsia-200">
                  {battleProgress.xpToNextLevel} XP to next level
                </span>
              </div>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-all duration-300"
                style={{ width: `${battleProgress.xpInLevel / 5}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/5 to-fuchsia-500/5 p-4 backdrop-blur-sm sm:mt-8 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                ClashPath
              </p>
              <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
                Personalized Mastery Path
              </h2>
            </div>
            {clashPathReport && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-cyan-200">
                Clash Rating {clashPathReport.clashRating}
              </span>
            )}
          </div>

          {isClashPathLoading ? (
            <p className="mt-4 text-sm text-white/50">
              Building your ClashPath from battle patterns...
            </p>
          ) : !clashPathReport ? (
            <p className="mt-4 text-sm text-white/50">
              ClashPath could not be generated for this run.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-white/70">
                {clashPathReport.improvementSummary}
              </p>
              <p className="mt-1 text-xs text-white/45">
                Arena state: {clashPathReport.masteryMapLabel}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    1. Mastered
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/90">
                    {clashPathReport.masteredTopics.length === 0
                      ? "None yet"
                      : clashPathReport.masteredTopics
                          .slice(0, 3)
                          .map((topic) => `${topic.topic} (${topic.masteryPercent}%)`)
                          .join(" · ")}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    2. Close To Mastery
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/90">
                    {clashPathReport.closeTopics.length === 0
                      ? "No near-mastery lane"
                      : clashPathReport.closeTopics
                          .slice(0, 3)
                          .map((topic) => `${topic.topic} (${topic.masteryPercent}%)`)
                          .join(" · ")}
                  </p>
                </div>
                <div className="rounded-xl border border-red-400/25 bg-red-500/[0.06] p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-300">
                    3. Weak Lanes
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/90">
                    {clashPathReport.weakTopics.length === 0
                      ? "No weak lane detected"
                      : clashPathReport.weakTopics
                          .slice(0, 3)
                          .map((topic) => `${topic.topic} (${topic.masteryPercent}%)`)
                          .join(" · ")}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/55">
                  4. Why You Are Missing Questions
                </p>
                {clashPathReport.whyMistakes.length === 0 ? (
                  <p className="mt-2 text-sm text-white/70">
                    No dominant mistake pattern found in this run.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {clashPathReport.whyMistakes.slice(0, 4).map((reason) => (
                      <div
                        key={reason.id}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
                      >
                        <p className="text-xs font-bold text-cyan-200">{reason.title}</p>
                        <p className="mt-0.5 text-xs text-white/60">{reason.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                    5. Next Best Battle
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    {clashPathReport.nextBestBattle.reason}
                  </p>
                  <Link
                    href={clashPathReport.nextBestBattle.href}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-3.5 py-2 text-xs font-bold text-white"
                  >
                    {clashPathReport.nextBestBattle.label}
                    <svg
                      className="h-3.5 w-3.5"
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
                  </Link>
                </div>

                <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/[0.06] p-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-300">
                    7. Next Best Move
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    {clashPathReport.nextBestMove}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/55">
                  6. Topic Mastery Map
                </p>
                {clashPathReport.topicInsights.length === 0 ? (
                  <p className="mt-2 text-sm text-white/60">
                    Topic mastery will appear once answer-level review data is available.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2.5">
                    {clashPathReport.topicInsights.map((topic) => (
                      <div key={topic.topic}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-white/90">
                            {topic.topic}
                          </p>
                          <span className="text-xs font-bold text-cyan-200">
                            {topic.masteryPercent}%
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${
                              topic.status === "mastered"
                                ? "bg-emerald-400"
                                : topic.status === "close"
                                  ? "bg-amber-400"
                                  : "bg-red-400"
                            }`}
                            style={{ width: `${topic.masteryPercent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Weak Topic Report */}
        {hasAnswerData && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-8 sm:p-6">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 flex-shrink-0 text-fuchsia-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">
                Weak Topic Report
              </p>
            </div>

            {weakTopics && weakTopics.length === 0 ? (
              <p className="mt-4 text-sm font-semibold text-emerald-300">
                No weak topics. Perfect run.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {weakTopics?.map((wt) => (
                  <div
                    key={wt.topic}
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-words text-sm font-bold text-white/90">
                        {wt.topic}
                      </p>
                      <span className="flex-shrink-0 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-300">
                        {wt.missedCount} missed
                      </span>
                    </div>
                    <p className="mt-1.5 break-words text-xs text-white/50 sm:text-sm">
                      {wt.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Study Plan & Resources */}
        {hasAnswerData && (
          <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 p-4 backdrop-blur-sm sm:mt-8 sm:p-6">
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
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
              <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                Study Plan &amp; Resources
              </p>
            </div>

            {topStudyTopics.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-emerald-300">
                No weak topics found. Keep reviewing to stay sharp.
              </p>
            ) : (
              <p className="mt-3 text-xs text-white/50 sm:text-sm">
                Here&apos;s a focused plan built from what you missed this
                round, starting with your weakest topic.
              </p>
            )}

            {/* Per-topic study cards */}
            {topStudyTopics.length > 0 && (
              <div className="mt-4 flex flex-col gap-4">
                {topStudyTopics.map((wt) => {
                  const resources = buildResourceLinks(
                    wt.topic,
                    deck.course_name
                  );

                  return (
                    <div
                      key={wt.topic}
                      className="rounded-xl border border-white/10 bg-black/30 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="break-words text-sm font-bold text-white/90 sm:text-base">
                          {wt.topic}
                        </p>
                        <span className="flex-shrink-0 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-300">
                          {wt.missedCount} missed
                        </span>
                      </div>

                      <p className="mt-2 break-words text-xs leading-relaxed text-white/60 sm:text-sm">
                        {buildStudyExplanation(wt.topic)}
                      </p>

                      {/* Resource links */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {resources.map((resource) => (
                          <a
                            key={resource.label}
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              safeTrackEvent("study_resource_opened", {
                                matchId: match.id,
                                deckId: deck.id,
                                topic: wt.topic,
                                resourceLabel: resource.label,
                                resourceUrl: resource.url,
                              })
                            }
                            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors duration-150 hover:border-cyan-400/40 hover:bg-white/10"
                          >
                            {resource.label}
                            <svg
                              className="h-3 w-3 flex-shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M10.5 6h-7.5c-.828 0-1.5.672-1.5 1.5v13.5c0 .828.672 1.5 1.5 1.5h13.5c.828 0 1.5-.672 1.5-1.5v-7.5M15 3h6v6M10 14l10.5-10.5"
                              />
                            </svg>
                          </a>
                        ))}
                      </div>

                      {/* Mini task */}
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                        <svg
                          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-fuchsia-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                          />
                        </svg>
                        <p className="text-xs leading-relaxed text-white/60">
                          <span className="font-bold text-white/80">
                            Mini task:
                          </span>{" "}
                          {buildMiniTask(wt.topic)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3-day study plan */}
            <div className="mt-5 border-t border-white/10 pt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                Your 3-Day Plan
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {studyPlan.map((day) => (
                  <div
                    key={day.day}
                    className="rounded-xl border border-white/10 bg-black/20 p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-[11px] font-bold text-white">
                        {day.day}
                      </span>
                      <p className="text-xs font-bold text-white/80 sm:text-sm">
                        {day.title}
                      </p>
                    </div>
                    <ul className="mt-2.5 flex flex-col gap-1.5">
                      {day.tasks.map((task, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] leading-relaxed text-white/50 sm:text-xs"
                        >
                          <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-cyan-300" />
                          <span className="break-words">{task}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Topic Performance: Best vs Weakest */}
        {hasAnswerData && topicStats.length > 0 && (
          <div className="mt-6 grid w-full grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-2">
            {/* Best topics */}
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.03] p-4 backdrop-blur-sm sm:p-6">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-emerald-300"
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
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Best Topics
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-2.5">
                {bestTopics.map((t) => (
                  <div key={t.topic}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white/90">
                        {t.topic}
                      </p>
                      <span className="flex-shrink-0 text-xs font-bold text-emerald-300">
                        {t.accuracy}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${t.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weakest topics */}
            <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.03] p-4 backdrop-blur-sm sm:p-6">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-red-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <p className="text-xs font-bold uppercase tracking-wider text-red-300">
                  Weakest Topics
                </p>
              </div>
              <div className="mt-4 flex flex-col gap-2.5">
                {weakestTopics.map((t) => (
                  <div key={t.topic}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white/90">
                        {t.topic}
                      </p>
                      <span className="flex-shrink-0 text-xs font-bold text-red-300">
                        {t.accuracy}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-red-400"
                        style={{ width: `${t.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Score card */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-8 sm:p-6 lg:p-7 xl:p-8">
          {/* Big score */}
          <div className="text-center">
            <span className="text-5xl font-black bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent sm:text-6xl md:text-7xl">
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
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <p className="text-base font-bold text-emerald-300 sm:text-lg md:text-xl">
                {match.correct_answers}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                Correct
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <p className="text-base font-bold text-red-300 sm:text-lg md:text-xl">
                {wrongAnswers}
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                Wrong
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <p className="text-base font-bold text-cyan-300 sm:text-lg md:text-xl">
                {accuracyPercent}%
              </p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                Accuracy
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-center sm:p-4">
              <p className="text-base font-bold text-violet-300 sm:text-lg md:text-xl">
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
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-400/40 hover:bg-white/10"
          >
            {linkCopied ? (
              <>
                <svg
                  className="h-4 w-4 flex-shrink-0 text-emerald-400"
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
                  className="h-4 w-4 flex-shrink-0 text-cyan-300"
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
                Copy Challenge Message
              </>
            )}
          </button>

          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-white/75 sm:text-sm">
              {challengePreviewMessage}
            </p>
          </div>

          <p className="mt-3 text-center text-xs text-white/35">
            Challenge link: /challenge/{match.id}
          </p>
        </div>

        {/* Deck Leaderboard */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-8 sm:p-6 md:p-8">
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
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              Deck Leaderboard
            </p>
          </div>

          {isLeaderboardLoading ? (
            <p className="mt-4 text-sm text-white/45">Loading leaderboard...</p>
          ) : deckLeaderboard.length === 0 ? (
            <p className="mt-4 text-sm text-white/45">
              No scores yet. You can be the first entry.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2.5">
              {deckLeaderboard.map((entry, index) => {
                const accuracy = Math.round(
                  (entry.correct_answers / entry.total_questions) * 100
                );
                const isCurrentMatch = entry.id === match.id;

                return (
                  <div
                    key={entry.id}
                    className={`rounded-xl border px-3 py-3 transition-colors duration-150 ${
                      isCurrentMatch
                        ? "border-fuchsia-400/30 bg-fuchsia-500/10"
                        : "border-white/10 bg-black/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            index === 0
                              ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-black"
                              : "bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-fuchsia-300"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <p className="truncate text-sm font-bold text-white/90">
                          {entry.player_name}
                        </p>
                        {isCurrentMatch && (
                          <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                            This run
                          </span>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-sm font-bold text-cyan-300">
                        {entry.score} pts
                      </span>
                    </div>

                    <p className="mt-2 text-[10px] text-white/40">
                      {accuracy}% accuracy · {formatTime(entry.time_taken_seconds)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Answer Review */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:mt-8 sm:p-6 md:p-8">
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
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
              />
            </svg>
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">
              Answer Review
            </p>
          </div>

          {reviewItems.length === 0 ? (
            <p className="mt-4 text-sm text-white/50">
              {answerDataMessage ||
                "No answer review found for this match. Play a new battle to record answers."}
            </p>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              {reviewItems.map((item, index) => {
                const reportState = getReportState(item.question.id);
                const mistakeBreakdown = mistakeBreakdowns.find(
                  (entry) => entry.questionId === item.question.id
                );
                const confidenceStyle = mistakeBreakdown
                  ? getConfidenceStyle(mistakeBreakdown.confidenceRating)
                  : null;

                return (
                  <div
                    key={item.question.id}
                    className={`rounded-xl border p-4 sm:p-5 ${
                      item.isCorrect
                        ? "border-emerald-400/30 bg-emerald-500/5"
                        : "border-red-400/30 bg-red-500/5"
                    }`}
                  >
                    {/* Header row: number, topic, difficulty, result badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-white/40">
                          Q{index + 1}
                        </span>
                        <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                          {item.question.topic}
                        </span>
                        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          {item.question.difficulty}
                        </span>
                      </div>
                      <span
                        className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          item.isCorrect
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-red-500/10 text-red-300"
                        }`}
                      >
                        {item.isCorrect ? "✅ Correct" : "❌ Wrong"}
                      </span>
                    </div>

                    {/* Question text */}
                    <p className="mt-3 break-words text-sm font-semibold leading-snug text-white/90 sm:text-base">
                      {item.question.question_text}
                    </p>

                    {/* Selected vs correct answer */}
                    <div className="mt-3 flex flex-col gap-1.5 text-sm">
                      <p className="break-words text-white/70">
                        Your answer:{" "}
                        <span
                          className={`font-semibold ${
                            item.isCorrect ? "text-emerald-300" : "text-red-300"
                          }`}
                        >
                          {item.selectedAnswer}
                        </span>
                      </p>
                      {!item.isCorrect && (
                        <p className="break-words text-white/70">
                          Correct answer:{" "}
                          <span className="font-semibold text-emerald-300">
                            {item.question.correct_answer}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Explanation */}
                    <div className="mt-3 break-words rounded-lg border border-white/10 bg-black/20 px-3.5 py-2.5 text-xs text-white/60 sm:text-sm">
                      {item.question.explanation}
                    </div>

                    {!item.isCorrect && mistakeBreakdown && confidenceStyle && (
                      <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] p-3.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                          Mistake Breakdown
                        </p>

                        <div className="mt-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                          <p className="text-[11px] font-bold text-white/55">
                            1. Selected answer
                          </p>
                          <p className="mt-1 text-xs text-red-200">
                            {mistakeBreakdown.selectedAnswer}
                          </p>
                          <p className="mt-2 text-[11px] font-bold text-white/55">
                            2. Correct answer
                          </p>
                          <p className="mt-1 text-xs text-emerald-200">
                            {mistakeBreakdown.correctAnswer}
                          </p>
                        </div>

                        <div className="mt-2 space-y-2">
                          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                            <p className="text-[11px] font-bold text-white/55">
                              3. Why your answer was tempting but wrong
                            </p>
                            <p className="mt-1 text-xs text-white/75">
                              {mistakeBreakdown.temptingButWrongReason}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                            <p className="text-[11px] font-bold text-white/55">
                              4. Why the correct answer is right
                            </p>
                            <p className="mt-1 text-xs text-white/75">
                              {mistakeBreakdown.correctWhyReason}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                            <p className="text-[11px] font-bold text-white/55">
                              5. Exact concept misunderstood
                            </p>
                            <p className="mt-1 text-xs text-white/75">
                              {mistakeBreakdown.misunderstoodConcept}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                            <p className="text-[11px] font-bold text-white/55">
                              6. Simpler explanation
                            </p>
                            <p className="mt-1 text-xs text-white/75">
                              {mistakeBreakdown.simplerExplanation}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                            <p className="text-[11px] font-bold text-white/55">
                              7. Memory trick
                            </p>
                            <p className="mt-1 text-xs text-white/75">
                              {mistakeBreakdown.memoryTrick}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                            <p className="text-[11px] font-bold text-white/55">
                              8. Mini follow-up question
                            </p>
                            <p className="mt-1 text-xs text-white/75">
                              {mistakeBreakdown.miniFollowUpQuestion}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${confidenceStyle.border} ${confidenceStyle.bg} ${confidenceStyle.text}`}
                          >
                            9. Confidence Rating: {getMistakeTypeLabel(mistakeBreakdown.confidenceRating)}
                          </span>

                          <Link
                            href={mistakeBreakdown.fixWeaknessHref}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 py-1.5 text-[11px] font-bold text-cyan-200 transition-colors hover:bg-cyan-500/25"
                          >
                            Fix This Weakness
                            <svg
                              className="h-3.5 w-3.5"
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
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Report Wrong Question */}
                    <div className="mt-4 border-t border-white/10 pt-3">
                      {reportState.isSubmitted ? (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                          ✅ Report submitted
                        </p>
                      ) : reportState.isFormOpen ? (
                        <div className="flex flex-col gap-2">
                          <select
                            value={reportState.selectedReason}
                            onChange={(e) =>
                              updateReportState(item.question.id, {
                                selectedReason: e.target.value,
                              })
                            }
                            disabled={reportState.isSubmitting}
                            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400/50 sm:text-xs"
                          >
                            {REPORT_REASONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                          </select>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleSubmitReport(item.question.id)
                              }
                              disabled={reportState.isSubmitting}
                              className="flex-1 rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-600 px-3 py-2.5 text-xs font-bold text-white transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:hover:scale-[1.02]"
                            >
                              {reportState.isSubmitting
                                ? "Submitting..."
                                : "Submit"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleCancelReport(item.question.id)
                              }
                              disabled={reportState.isSubmitting}
                              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold text-white/60 transition-colors duration-150 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenReportForm(item.question.id)}
                          className="flex items-center gap-1.5 py-1 text-xs font-semibold text-white/40 transition-colors duration-150 hover:text-red-300"
                        >
                          <svg
                            className="h-3.5 w-3.5 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
                            />
                          </svg>
                          Report Wrong Question
                        </button>
                      )}

                      {reportState.error && (
                        <p className="mt-2 break-words text-xs text-red-300">
                          {reportState.error}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isSavingMistakes && mistakeBreakdowns.length > 0 && (
          <p className="mt-3 text-center text-xs text-white/35">
            Saving mistake pattern data for future battles...
          </p>
        )}

        <GigglesCoach
          deckId={deck.id}
          matchId={match.id}
          deckTitle={deck.title}
          courseName={deck.course_name}
          playerName={match.player_name}
          weakTopics={coachWeakTopics}
          missedQuestions={coachMissedQuestions}
          mistakeDna={coachMistakeDna}
          battleScore={match.score}
          accuracyPercent={currentAccuracyPercent}
          previousRematches={coachPreviousRematches}
          masteryProgress={coachMasteryProgress}
          currentQuestion={
            coachMissedQuestions.length > 0
              ? {
                  questionText: coachMissedQuestions[0].questionText,
                  selectedAnswer: coachMissedQuestions[0].selectedAnswer,
                  correctAnswer: coachMissedQuestions[0].correctAnswer,
                  explanation: coachMissedQuestions[0].explanation,
                }
              : undefined
          }
          recentBattleHistory={deckLeaderboard.slice(0, 6).map((entry) => ({
            score: entry.score,
            accuracyPercent:
              entry.total_questions > 0
                ? Math.round((entry.correct_answers / entry.total_questions) * 100)
                : undefined,
          }))}
          contextLabel="Results"
        />

        <div className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] px-4 py-3 text-center text-xs text-cyan-100/90 sm:mt-8">
          Next move: run a rematch, review weak topics, then repeat until accuracy climbs.
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
          <Link
            href={
              isRivalBattle
                ? `/battle/${deck.id}?mode=rival&rivalRank=${encodeURIComponent(rivalRank)}`
                : `/battle/${deck.id}`
            }
            onClick={() =>
              safeTrackEvent("results_rematch_clicked", {
                matchId: match.id,
                deckId: deck.id,
                mode: isRivalBattle ? "rival" : "battle",
                rivalRank: isRivalBattle ? rivalRank : undefined,
              })
            }
            className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:px-8 sm:hover:scale-[1.02]"
          >
            <span className="relative z-10">{isRivalBattle ? "Rematch Rival" : "Rematch This Deck"}</span>
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

          <Link
            href={`/battle/${deck.id}?mode=quick_check&limit=5`}
            onClick={() =>
              safeTrackEvent("results_quick_check_clicked", {
                matchId: match.id,
                deckId: deck.id,
              })
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-6 py-4 text-base font-bold text-white/80 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-300/40 hover:bg-white/10 sm:px-8"
          >
            Quick Check (5)
          </Link>

          <Link
            href={`/battle/${deck.id}?mode=practice`}
            onClick={() =>
              safeTrackEvent("results_practice_mode_clicked", {
                matchId: match.id,
                deckId: deck.id,
              })
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-6 py-4 text-base font-bold text-white/80 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-300/40 hover:bg-white/10 sm:px-8"
          >
            Practice Mode
          </Link>

          <Link
            href={`/battle/${deck.id}?mode=rival${rivalRank ? `&rivalRank=${encodeURIComponent(rivalRank)}` : ""}`}
            onClick={() =>
              safeTrackEvent("results_rival_battle_clicked", {
                matchId: match.id,
                deckId: deck.id,
                rivalRank,
              })
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/12 px-6 py-4 text-base font-bold text-cyan-100 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-300/40 hover:bg-cyan-500/20 sm:px-8"
          >
            Study Rival
          </Link>

          <Link
            href={`/battle/${deck.id}?mode=boss`}
            onClick={() =>
              safeTrackEvent("results_boss_battle_clicked", {
                matchId: match.id,
                deckId: deck.id,
              })
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/12 px-6 py-4 text-base font-bold text-fuchsia-100 backdrop-blur-sm transition-colors duration-150 hover:border-fuchsia-300/40 hover:bg-fuchsia-500/20 sm:px-8"
          >
            Boss Battle
          </Link>

          {weakTopics && weakTopics.length > 0 && (
            <Link
              href={`/battle/${deck.id}?mode=weak_topic&topics=${weakTopicQueryValue}`}
              onClick={() =>
                safeTrackEvent("results_weak_topics_practice_clicked", {
                  matchId: match.id,
                  deckId: deck.id,
                  topics: weakTopics.map((topic) => topic.topic),
                })
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-6 py-4 text-base font-bold text-cyan-200 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-300/40 hover:bg-cyan-500/15 sm:px-8"
            >
              Practice Weak Topics
            </Link>
          )}

          {reviewItems.some((item) => !item.isCorrect) && (
            <Link
              href={`/battle/${deck.id}?mode=review_missed&topics=${missedTopicQueryValue}`}
              onClick={() =>
                safeTrackEvent("results_review_missed_clicked", {
                  matchId: match.id,
                  deckId: deck.id,
                })
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-6 py-4 text-base font-bold text-amber-200 backdrop-blur-sm transition-colors duration-150 hover:border-amber-300/40 hover:bg-amber-500/15 sm:px-8"
            >
              Review Missed
            </Link>
          )}

          <Link
            href="/create"
            onClick={() =>
              safeTrackEvent("results_create_new_deck_clicked", {
                matchId: match.id,
                deckId: deck.id,
              })
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-base font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10 sm:px-8"
          >
            Create New Deck
          </Link>
        </div>

        {/* View leaderboard */}
        <Link
          href={`/battle/${deck.id}`}
          onClick={() =>
            safeTrackEvent("results_view_leaderboard_clicked", {
              matchId: match.id,
              deckId: deck.id,
            })
          }
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-6 py-3.5 text-sm font-bold text-white/60 transition-colors duration-150 hover:border-cyan-400/30 hover:text-cyan-300 sm:px-8"
        >
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
          View Leaderboard
        </Link>
      </div>
    </Background>
  );
}