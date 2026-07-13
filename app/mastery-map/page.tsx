"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import VyraCoach from "@/app/components/VyraCoach";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import {
  getTopicStatus,
  getReviewSchedule,
  type TopicStatus,
  type ReviewUrgency,
} from "@/lib/srsSchedule";

type DeckLite = {
  id: string;
  title: string;
  course_name: string;
};

type MatchLite = {
  id: string;
  deck_id: string;
  created_at: string;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number;
};

type QuestionLite = {
  id: string;
  deck_id: string;
  topic: string;
  difficulty: string;
  question_text?: string;
  explanation?: string;
  correct_answer?: string;
};

type AnswerLite = {
  match_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  response_time_ms: number | null;
};

type MistakeRow = {
  deck_id: string;
  topic: string;
  confidence_rating: string;
};

type DueQuestionItem = {
  questionId: string;
  topic: string;
  status: string;
};

type TopicNode = {
  topic: string;
  accuracy: number;
  averageSpeedMs: number;
  averageSpeedLabel: string;
  mistakeType: string;
  lastPracticedDate: string;
  recommendedAction: string;
  status: TopicStatus;
  practiceHref: string;
  rematchHref: string;
  bossHref: string;
  attemptedCount: number;
  missedCount: number;
  nextReviewLabel: string;
  reviewUrgency: ReviewUrgency;
};

type SubjectMastery = {
  deckId: string;
  subjectName: string;
  title: string;
  masteryPercent: number;
  masteredTopics: TopicNode[];
  improvingTopics: TopicNode[];
  weakTopics: TopicNode[];
  allTopics: TopicNode[];
  bossLocked: boolean;
  lockedBossReason: string;
  recommendedNextBattles: Array<{
    label: string;
    href: string;
    reason: string;
  }>;
  dueQuestionCount: number;
  dueReviewHref: string | null;
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-emerald-500/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pt-10 sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

function normalizeTopic(topic: string): string {
  const trimmed = (topic || "General").trim();
  return trimmed || "General";
}

// Prefers the exact due/weak question IDs from question_review_schedule
// (via /api/mastery/due-questions) when available -- targets precisely
// what this student is missing instead of "anything tagged with this topic
// label." Falls back to the existing topics= fuzzy match for a topic with
// no per-question history yet (e.g. it was only just practiced).
function buildRematchHref(args: { deckId: string; topic: string; questionIds?: string[] }): string {
  const { deckId, topic, questionIds } = args;

  if (questionIds && questionIds.length > 0) {
    return `/battle/${deckId}?mode=review_missed&questionIds=${encodeURIComponent(questionIds.join(","))}&limit=8`;
  }

  return `/battle/${deckId}?mode=review_missed&topics=${encodeURIComponent(topic)}&limit=8`;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "Not practiced yet";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Not practiced yet";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toSpeedLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "N/A";
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

function getRecommendedAction(status: TopicStatus, missedCount: number): string {
  if (status === "mastered") {
    return "Quick-check to maintain mastery.";
  }

  if (status === "improving") {
    return "Practice this topic to push it into mastered.";
  }

  if (missedCount >= 3) {
    return "Run a weak-topic rematch and slow down on hard prompts.";
  }

  return "Revisit concept explanations, then rematch weakness.";
}

function getReviewBadgeStyle(urgency: ReviewUrgency): string {
  if (urgency === "overdue") return "border-red-400/40 bg-red-500/15 text-red-200";
  if (urgency === "due_soon") return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  if (urgency === "unscheduled") return "border-white/15 bg-white/5 text-white/50";
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-200";
}

function getMistakeLabel(raw: string | undefined): string {
  if (raw === "careless_mistake" || raw === "careless_error") return "Careless Error";
  if (raw === "concept_gap") return "Concept Gap";
  if (raw === "slow_response" || raw === "speed_trap") return "Speed Trap";
  if (raw === "misread_question") return "Misread Question";
  if (raw === "guessing_pattern") return "Guessing Pattern";
  if (raw === "repeated_weakness") return "Repeated Weakness";
  if (raw === "almost_mastered") return "Almost Mastered";
  return "Mixed errors";
}

function getStatusStyle(status: TopicStatus): string {
  if (status === "mastered") {
    return "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-100";
  }

  if (status === "improving") {
    return "border-cyan-400/30 bg-cyan-500/[0.08] text-cyan-100";
  }

  return "border-amber-400/30 bg-amber-500/[0.08] text-amber-100";
}

function toTopicPrompt(topic: string, subject: string): string {
  return `Help me improve ${topic} in ${subject}. Give one simple explanation and one mini-quiz question.`;
}

function MasteryMapPageContent() {
  const { user, profile, isLoggedIn, isLoading } = useAuth();
  const searchParams = useSearchParams();

  const [isLoadingMap, setIsLoadingMap] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectMastery[]>([]);
  const [coachSeed, setCoachSeed] = useState(0);
  const [coachContext, setCoachContext] = useState<{
    deckId: string;
    deckTitle: string;
    courseName: string;
    weakTopics: string[];
    topicPrompt: string;
    masteryProgress: Array<{ label: string; value: number; details: string }>;
  } | null>(null);

  useEffect(() => {
    async function loadMasteryMap() {
      if (!user) return;

      setIsLoadingMap(true);
      setLoadError(null);
      setSubjects([]);

      try {
        const { data: deckRows, error: deckError } = await supabase
          .from("decks")
          .select("id, title, course_name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (deckError) throw deckError;

        const decks = (deckRows || []) as DeckLite[];
        if (decks.length === 0) {
          setSubjects([]);
          setIsLoadingMap(false);
          return;
        }

        const deckIds = decks.map((deck) => deck.id);
        const preferredName =
          profile?.display_name?.trim() ||
          user.email?.split("@")[0]?.trim() ||
          null;

        // Per-question due/weak data (question_review_schedule via
        // /api/mastery/due-questions) sharpens rematch links below to the
        // exact questions this student is missing, instead of matching by
        // topic label alone. Best-effort per deck -- a failed or empty
        // response just means that deck's rematch links fall back to the
        // existing topic-string matching, never blocks the rest of the page.
        const dueByDeck = new Map<string, DueQuestionItem[]>();
        await Promise.all(
          deckIds.map(async (id) => {
            try {
              const response = await authFetch(`/api/mastery/due-questions?deckId=${id}`);
              if (!response.ok) return;
              const data = await response.json();
              const items = Array.isArray(data?.items) ? (data.items as DueQuestionItem[]) : [];
              if (items.length > 0) dueByDeck.set(id, items);
            } catch {
              // Best-effort -- leave this deck's rematch links on the topic-string fallback.
            }
          })
        );

        const matchQuery = supabase
          .from("matches")
          .select("id, deck_id, created_at, correct_answers, total_questions, time_taken_seconds")
          .in("deck_id", deckIds)
          .order("created_at", { ascending: false })
          .limit(600);

        const { data: userMatchRows, error: userMatchError } = await matchQuery.eq("user_id", user.id);

        if (userMatchError) throw userMatchError;

        let matchRows = (userMatchRows || []) as MatchLite[];

        if (matchRows.length === 0 && preferredName) {
          const { data: fallbackRows, error: fallbackError } = await supabase
            .from("matches")
            .select("id, deck_id, created_at, correct_answers, total_questions, time_taken_seconds")
            .in("deck_id", deckIds)
            .eq("player_name", preferredName)
            .order("created_at", { ascending: false })
            .limit(600);

          if (fallbackError) throw fallbackError;
          matchRows = (fallbackRows || []) as MatchLite[];
        }

        const matchIds = matchRows.map((row) => row.id);

        const [questionResult, answerResult, mistakeResult] = await Promise.all([
          supabase
            .from("questions")
            .select("id, deck_id, topic, difficulty, question_text, explanation, correct_answer")
            .in("deck_id", deckIds),
          matchIds.length > 0
            ? supabase
                .from("match_answers")
                .select("match_id, question_id, selected_answer, is_correct, response_time_ms")
                .in("match_id", matchIds)
            : Promise.resolve({ data: [], error: null }),
          matchIds.length > 0
            ? supabase
                .from("mistake_breakdowns")
                .select("deck_id, topic, confidence_rating")
                .in("match_id", matchIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (questionResult.error) throw questionResult.error;
        if (answerResult.error) throw answerResult.error;
        if (mistakeResult.error) throw mistakeResult.error;

        const questions = (questionResult.data || []) as QuestionLite[];
        const answers = (answerResult.data || []) as AnswerLite[];
        const mistakes = (mistakeResult.data || []) as MistakeRow[];

        const questionById = new Map<string, QuestionLite>();
        for (const question of questions) {
          questionById.set(question.id, question);
        }

        const matchById = new Map<string, MatchLite>();
        for (const row of matchRows) {
          matchById.set(row.id, row);
        }

        const subjectRows: SubjectMastery[] = decks.map((deck) => {
          const deckMatches = matchRows.filter((row) => row.deck_id === deck.id);
          const deckMatchIds = new Set(deckMatches.map((row) => row.id));
          const deckAnswers = answers.filter((row) => deckMatchIds.has(row.match_id));

          const topicMap = new Map<
            string,
            {
              total: number;
              correct: number;
              speedSum: number;
              speedCount: number;
              lastPracticedTs: number;
              misses: number;
            }
          >();

          for (const answer of deckAnswers) {
            const question = questionById.get(answer.question_id);
            if (!question) continue;

            const topic = normalizeTopic(question.topic);
            const entry = topicMap.get(topic) || {
              total: 0,
              correct: 0,
              speedSum: 0,
              speedCount: 0,
              lastPracticedTs: 0,
              misses: 0,
            };

            entry.total += 1;
            if (answer.is_correct) {
              entry.correct += 1;
            } else {
              entry.misses += 1;
            }

            const responseMs = Number(answer.response_time_ms || 0);
            if (Number.isFinite(responseMs) && responseMs > 0) {
              entry.speedSum += responseMs;
              entry.speedCount += 1;
            }

            const practicedAt = matchById.get(answer.match_id)?.created_at || "";
            const practicedTs = new Date(practicedAt).getTime();
            if (Number.isFinite(practicedTs) && practicedTs > entry.lastPracticedTs) {
              entry.lastPracticedTs = practicedTs;
            }

            topicMap.set(topic, entry);
          }

          const deckMistakes = mistakes.filter((row) => row.deck_id === deck.id);
          const topMistakeByTopic = new Map<string, string>();

          const mistakeAgg = new Map<string, Map<string, number>>();
          for (const row of deckMistakes) {
            const topic = normalizeTopic(row.topic);
            const rating = String(row.confidence_rating || "");
            const bucket = mistakeAgg.get(topic) || new Map<string, number>();
            bucket.set(rating, (bucket.get(rating) || 0) + 1);
            mistakeAgg.set(topic, bucket);
          }

          for (const [topic, bucket] of mistakeAgg.entries()) {
            const top = Array.from(bucket.entries()).sort((a, b) => b[1] - a[1])[0];
            topMistakeByTopic.set(topic, top ? top[0] : "");
          }

          const deckDueItems = dueByDeck.get(deck.id) || [];
          const dueQuestionIdsByTopic = new Map<string, string[]>();
          for (const item of deckDueItems) {
            const topic = normalizeTopic(item.topic);
            const bucket = dueQuestionIdsByTopic.get(topic) || [];
            bucket.push(item.questionId);
            dueQuestionIdsByTopic.set(topic, bucket);
          }

          const allTopics: TopicNode[] = Array.from(topicMap.entries())
            .map(([topic, stats]) => {
              const accuracy =
                stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
              const speed =
                stats.speedCount > 0 ? Math.round(stats.speedSum / stats.speedCount) : 0;
              const status = getTopicStatus(accuracy);
              const reviewSchedule = getReviewSchedule({
                status,
                attemptedCount: stats.total,
                lastPracticedTs: stats.lastPracticedTs,
              });

              return {
                topic,
                accuracy,
                averageSpeedMs: speed,
                averageSpeedLabel: toSpeedLabel(speed),
                mistakeType: getMistakeLabel(topMistakeByTopic.get(topic)),
                lastPracticedDate: formatDate(
                  stats.lastPracticedTs > 0
                    ? new Date(stats.lastPracticedTs).toISOString()
                    : null
                ),
                recommendedAction: getRecommendedAction(status, stats.misses),
                status,
                practiceHref: `/battle/${deck.id}?mode=weak_topic&topics=${encodeURIComponent(topic)}&limit=8`,
                rematchHref: buildRematchHref({
                  deckId: deck.id,
                  topic,
                  questionIds: dueQuestionIdsByTopic.get(topic),
                }),
                bossHref: `/battle/${deck.id}?mode=boss`,
                attemptedCount: stats.total,
                missedCount: stats.misses,
                nextReviewLabel: reviewSchedule.label,
                reviewUrgency: reviewSchedule.urgency,
              };
            })
            .sort((a, b) => a.accuracy - b.accuracy || b.attemptedCount - a.attemptedCount);

          const masteredTopics = allTopics.filter((topic) => topic.status === "mastered");
          const improvingTopics = allTopics.filter((topic) => topic.status === "improving");
          const weakTopics = allTopics.filter((topic) => topic.status === "weak");

          const masteryPercent =
            allTopics.length > 0
              ? Math.round(
                  allTopics.reduce((sum, topic) => sum + topic.accuracy, 0) /
                    allTopics.length
                )
              : 0;

          const bossLocked = deckMatches.length < 3 || weakTopics.length === 0;
          const lockedBossReason =
            deckMatches.length < 3
              ? "Complete at least 3 battles on this subject to unlock boss battles."
              : weakTopics.length === 0
                ? "No weak lanes detected yet. A boss unlocks once weak-topic pressure appears."
                : "Boss unlocked.";

          const recommendedNextBattles: Array<{
            label: string;
            href: string;
            reason: string;
          }> = [];

          if (weakTopics[0]) {
            recommendedNextBattles.push({
              label: `Practice ${weakTopics[0].topic}`,
              href: weakTopics[0].practiceHref,
              reason: `${weakTopics[0].accuracy}% accuracy and ${weakTopics[0].missedCount} misses make this your top priority lane.`,
            });
          }

          if (improvingTopics[0]) {
            recommendedNextBattles.push({
              label: `Promote ${improvingTopics[0].topic}`,
              href: improvingTopics[0].practiceHref,
              reason: `${improvingTopics[0].topic} is close to mastery. One focused run can push it above 85%.`,
            });
          }

          recommendedNextBattles.push({
            label: bossLocked ? "Prepare Boss Unlock" : "Start Boss Battle",
            href: `/battle/${deck.id}?mode=boss`,
            reason: bossLocked
              ? lockedBossReason
              : `Boss battle is open for ${deck.course_name}. Defeat it to prove subject mastery.`,
          });

          const allDueQuestionIds = Array.from(
            new Set(deckDueItems.map((item) => item.questionId))
          );

          return {
            deckId: deck.id,
            subjectName: deck.course_name,
            title: deck.title,
            masteryPercent,
            masteredTopics,
            improvingTopics,
            weakTopics,
            allTopics,
            bossLocked,
            lockedBossReason,
            recommendedNextBattles,
            dueQuestionCount: allDueQuestionIds.length,
            dueReviewHref:
              allDueQuestionIds.length > 0
                ? `/battle/${deck.id}?mode=review_missed&questionIds=${encodeURIComponent(allDueQuestionIds.join(","))}`
                : null,
          };
        });

        setSubjects(subjectRows);

        const initialTopic = searchParams.get("topic");
        if (initialTopic && subjectRows.length > 0) {
          const firstSubject = subjectRows[0];
          const fallbackWeak = firstSubject.weakTopics[0] || firstSubject.allTopics[0];
          if (fallbackWeak) {
            const pickedTopic = initialTopic || fallbackWeak.topic;
            setCoachContext({
              deckId: firstSubject.deckId,
              deckTitle: firstSubject.title,
              courseName: firstSubject.subjectName,
              weakTopics: firstSubject.weakTopics.slice(0, 4).map((topic) => topic.topic),
              topicPrompt: toTopicPrompt(pickedTopic, firstSubject.subjectName),
              masteryProgress: firstSubject.allTopics.slice(0, 6).map((topic) => ({
                label: topic.topic,
                value: topic.accuracy,
                details: `${topic.averageSpeedLabel} avg speed`,
              })),
            });
            setCoachSeed((seed) => seed + 1);
          }
        }
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Mastery Map could not be loaded right now."
        );
      } finally {
        setIsLoadingMap(false);
      }
    }

    if (isLoggedIn && user) {
      void loadMasteryMap();
    } else if (!isLoading) {
      void Promise.resolve().then(() => setIsLoadingMap(false));
    }
  }, [isLoggedIn, isLoading, profile?.display_name, searchParams, user]);

  const globalSummary = useMemo(() => {
    const topicCount = subjects.reduce((sum, subject) => sum + subject.allTopics.length, 0);
    const totalMastery = subjects.reduce((sum, subject) => sum + subject.masteryPercent, 0);
    const masteryAverage = subjects.length > 0 ? Math.round(totalMastery / subjects.length) : 0;
    const lockedBossCount = subjects.filter((subject) => subject.bossLocked).length;

    return {
      topicCount,
      masteryAverage,
      lockedBossCount,
    };
  }, [subjects]);

  function handleAskVyra(subject: SubjectMastery, topic: TopicNode) {
    setCoachContext({
      deckId: subject.deckId,
      deckTitle: subject.title,
      courseName: subject.subjectName,
      weakTopics: subject.weakTopics.slice(0, 4).map((item) => item.topic),
      topicPrompt: toTopicPrompt(topic.topic, subject.subjectName),
      masteryProgress: subject.allTopics.slice(0, 6).map((item) => ({
        label: item.topic,
        value: item.accuracy,
        details: `${item.averageSpeedLabel} avg speed`,
      })),
    });
    setCoachSeed((seed) => seed + 1);
  }

  if (isLoading || isLoadingMap) {
    return (
      <Background>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <svg className="h-10 w-10 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="mt-4 text-sm text-white/50">Loading Mastery Map...</p>
        </div>
      </Background>
    );
  }

  if (!isLoggedIn) {
    return (
      <Background>
        <div className="mx-auto flex min-h-[65vh] w-full max-w-md items-center justify-center">
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:p-8">
            <h1 className="text-xl font-bold text-white">Sign in to view Mastery Map</h1>
            <p className="mt-2 text-sm text-white/55">
              Track topic mastery, weak lanes, and boss unlock progress across every subject.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Link href="/login?redirect=/mastery-map" className="rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-5 py-3 text-sm font-bold text-white">
                Log In
              </Link>
              <Link href="/signup?redirect=/mastery-map" className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/90">
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </Background>
    );
  }

  return (
    <Background>
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-cyan-200">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                MASTERY MAP
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                <span className="bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-emerald-300 bg-clip-text text-transparent">
                  Skill Tree Command Center
                </span>
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-white/60 sm:text-base">
                Visualize mastered topics, weak lanes, improving skills, boss locks, and the exact next battles to climb faster.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/85">
                Dashboard
              </Link>
              <Link href="/decks" className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-100">
                Choose Deck
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Subject mastery</p>
              <p className="mt-1 text-2xl font-black text-white">{globalSummary.masteryAverage}%</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Tracked topics</p>
              <p className="mt-1 text-2xl font-black text-white">{globalSummary.topicCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">Locked boss battles</p>
              <p className="mt-1 text-2xl font-black text-white">{globalSummary.lockedBossCount}</p>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            {loadError}
          </div>
        )}

        {subjects.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-white/60">
            No study data yet. Play a few battles to generate your Mastery Map.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {subjects.map((subject) => (
              <section
                key={subject.deckId}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5"
              >
                <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.23em] text-cyan-200/90">{subject.subjectName}</p>
                    <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">{subject.title}</h2>
                    <p className="mt-2 text-sm text-white/60">
                      Mastery {subject.masteryPercent}% · Mastered {subject.masteredTopics.length} · Improving {subject.improvingTopics.length} · Weak {subject.weakTopics.length}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
                      Mastered {subject.masteredTopics.length}
                    </span>
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-200">
                      Improving {subject.improvingTopics.length}
                    </span>
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200">
                      Weak {subject.weakTopics.length}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        subject.bossLocked
                          ? "border-red-400/30 bg-red-500/10 text-red-200"
                          : "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200"
                      }`}
                    >
                      {subject.bossLocked ? "Boss Locked" : "Boss Ready"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[2fr,1fr]">
                  <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/25 p-4">
                    <div className="pointer-events-none absolute left-6 right-6 top-16 hidden h-[2px] bg-gradient-to-r from-cyan-400/50 via-fuchsia-400/40 to-emerald-400/50 lg:block" />
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Topic Skill Tree</p>
                      <p className="text-xs text-white/45">Node color = mastery lane</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {subject.allTopics.map((topic) => (
                        <article
                          key={`${subject.deckId}-${topic.topic}`}
                          className={`relative rounded-xl border p-3 ${getStatusStyle(topic.status)}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold leading-tight text-white">{topic.topic}</h3>
                            <span className="flex-shrink-0 rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
                              {topic.status}
                            </span>
                          </div>

                          <span
                            className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getReviewBadgeStyle(topic.reviewUrgency)}`}
                          >
                            {(topic.reviewUrgency === "overdue" || topic.reviewUrgency === "due_soon") && (
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                            )}
                            {topic.nextReviewLabel}
                          </span>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                              <p className="text-white/45">Accuracy</p>
                              <p className="mt-0.5 font-bold text-white">{topic.accuracy}%</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                              <p className="text-white/45">Avg speed</p>
                              <p className="mt-0.5 font-bold text-white">{topic.averageSpeedLabel}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                              <p className="text-white/45">Mistake type</p>
                              <p className="mt-0.5 font-semibold text-white/90">{topic.mistakeType}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                              <p className="text-white/45">Last practiced</p>
                              <p className="mt-0.5 font-semibold text-white/90">{topic.lastPracticedDate}</p>
                            </div>
                          </div>

                          <p className="mt-2 text-xs text-white/70">{topic.recommendedAction}</p>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Link
                              href={topic.practiceHref}
                              className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-2 text-center text-[11px] font-bold text-cyan-100"
                            >
                              Practice this topic
                            </Link>
                            <Link
                              href={topic.rematchHref}
                              className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-center text-[11px] font-bold text-amber-100"
                            >
                              Rematch weakness
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleAskVyra(subject, topic)}
                              className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-2 text-[11px] font-bold text-fuchsia-100"
                            >
                              Ask VYRA
                            </button>
                            <Link
                              href={topic.bossHref}
                              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-2 text-center text-[11px] font-bold text-emerald-100"
                            >
                              Start Boss Battle
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <aside className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/25 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white/50">Battle guidance</h3>

                    {subject.dueQuestionCount > 0 && subject.dueReviewHref && (
                      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200">Due for review</p>
                        <p className="mt-1 text-xs text-white/75">
                          {subject.dueQuestionCount} question{subject.dueQuestionCount === 1 ? "" : "s"} you missed or haven&apos;t locked in yet -- a short rematch keeps them from slipping.
                        </p>
                        <Link
                          href={subject.dueReviewHref}
                          className="mt-2 inline-flex items-center justify-center rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-100"
                        >
                          Review {subject.dueQuestionCount} Now
                        </Link>
                      </div>
                    )}

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-200">Locked boss battles</p>
                      <p className="mt-1 text-xs text-white/75">{subject.lockedBossReason}</p>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-200">Recommended next battles</p>
                      <div className="mt-2 flex flex-col gap-2">
                        {subject.recommendedNextBattles.map((battle) => (
                          <Link
                            key={`${subject.deckId}-${battle.label}`}
                            href={battle.href}
                            className="rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                          >
                            <p className="text-xs font-bold text-white">{battle.label}</p>
                            <p className="mt-1 text-[11px] text-white/60">{battle.reason}</p>
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">Mastery percentage</p>
                      <p className="mt-1 text-2xl font-black text-white">{subject.masteryPercent}%</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-emerald-400 transition-all duration-700 ease-out"
                          style={{ width: `${subject.masteryPercent}%` }}
                        />
                      </div>
                    </div>
                  </aside>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {coachContext && (
        <VyraCoach
          key={`vyra-${coachSeed}-${coachContext.deckId}`}
          deckId={coachContext.deckId}
          deckTitle={coachContext.deckTitle}
          courseName={coachContext.courseName}
          playerName={
            profile?.display_name || user?.email?.split("@")[0] || "Student"
          }
          weakTopics={coachContext.weakTopics}
          missedQuestions={[]}
          mistakeDna={[
            {
              topic: coachContext.topicPrompt,
              selectedAnswer: "",
              correctAnswer: "",
              misunderstoodConcept: coachContext.topicPrompt,
              mistakeType: "concept_gap",
            },
          ]}
          battleScore={0}
          accuracyPercent={undefined}
          previousRematches={0}
          masteryProgress={coachContext.masteryProgress}
          contextLabel="Mastery Map"
          openByDefault
        />
      )}
    </Background>
  );
}

function MasteryMapFallback() {
  return (
    <Background>
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <svg className="h-10 w-10 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="mt-4 text-sm text-white/50">Loading Mastery Map...</p>
      </div>
    </Background>
  );
}

export default function MasteryMapPage() {
  return (
    <Suspense fallback={<MasteryMapFallback />}>
      <MasteryMapPageContent />
    </Suspense>
  );
}
