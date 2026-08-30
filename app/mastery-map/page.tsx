"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import dynamic from "next/dynamic";
import { ArrowRightIcon } from "@/app/components/app/Icons";
import { computeMastery, type AttemptSignal } from "@/lib/mastery";
import { difficultyValue } from "@/lib/adaptiveSession";
import {
  getTopicStatus,
  getReviewSchedule,
  type TopicStatus,
  type ReviewUrgency,
} from "@/lib/srsSchedule";
import { MASTERY_TIER_LABELS, type MasteryTier } from "@/lib/masteryTiers";

// Closed-by-default chat widget -- code-split out of the main chunk so it
// doesn't block first paint/hydration of the mastery map.
const VyraCoach = dynamic(() => import("@/app/components/VyraCoach"), {
  ssr: false,
});

const MASTERY_MAP_MAX_DECKS = 30;

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
  masteryTier: MasteryTier;
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

// Review urgency and mastery tier both map onto the SAME three-step chip
// vocabulary the rest of the app uses (neutral / ok / warn / bad), rather than
// each inventing its own colour. Previously this screen used red, amber,
// indigo, green and white chips side by side, which made every badge read as
// decoration rather than as a status.
function reviewChipClass(urgency: ReviewUrgency): string {
  if (urgency === "overdue") return "chip chip-bad";
  if (urgency === "due_soon") return "chip chip-warn";
  if (urgency === "unscheduled") return "chip";
  return "chip chip-ok";
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

function tierChipClass(tier: MasteryTier): string {
  if (tier === "mastered" || tier === "strong") return "chip chip-ok";
  if (tier === "developing") return "chip chip-warn";
  return "chip chip-bad";
}

/** Bar colour for a topic's mastery meter, on the same three-step scale. */
function tierMeterColor(tier: MasteryTier): string {
  if (tier === "mastered" || tier === "strong") return "var(--ok)";
  if (tier === "developing") return "var(--warn)";
  return "var(--bad)";
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
        // Capped (unlike the plain decks list, which paginates) because
        // every deck here fans out into its own due-questions request plus
        // shares in the matches/questions/mistake_breakdowns .in() queries
        // below -- an unbounded deck count would make this page's cost
        // scale with a student's lifetime deck count, not their current
        // course load. Most recent decks are what a mastery view should
        // prioritize anyway.
        const { data: deckRows, error: deckError } = await supabase
          .from("decks")
          .select("id, title, course_name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(0, MASTERY_MAP_MAX_DECKS - 1);

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

        // This student's own typical answering pace, across everything they
        // have ever answered. The mastery engine compares against it to
        // spot hesitation, so it has to be their baseline and not a global
        // constant -- a deliberate thinker is not a struggling one.
        const timedAnswers = answers
          .map((row) => Number(row.response_time_ms || 0))
          .filter((ms) => Number.isFinite(ms) && ms > 0);
        const baselineResponseMs =
          timedAnswers.length >= 5
            ? timedAnswers.reduce((sum, ms) => sum + ms, 0) / timedAnswers.length
            : null;

        const subjectRows: SubjectMastery[] = decks.map((deck) => {
          const deckMatches = matchRows.filter((row) => row.deck_id === deck.id);
          const deckMatchIds = new Set(deckMatches.map((row) => row.id));
          const deckAnswers = answers.filter((row) => deckMatchIds.has(row.match_id));

          // Per-attempt history, not just totals. This screen reads raw
          // match_answers, which means it can hand the mastery engine the
          // richest input it accepts -- every answer with its difficulty,
          // response time and timestamp -- rather than the cumulative
          // counts the shared snapshot has to make do with.
          const topicMap = new Map<
            string,
            {
              total: number;
              correct: number;
              speedSum: number;
              speedCount: number;
              lastPracticedTs: number;
              misses: number;
              sessionIds: Set<string>;
              attempts: AttemptSignal[];
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
              sessionIds: new Set<string>(),
              attempts: [] as AttemptSignal[],
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

            entry.sessionIds.add(answer.match_id);
            entry.attempts.push({
              isCorrect: Boolean(answer.is_correct),
              at: Date.parse(matchById.get(answer.match_id)?.created_at || "") || 0,
              difficulty: difficultyValue(question.difficulty),
              responseMs: responseMs > 0 ? responseMs : null,
            });

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
              const speed =
                stats.speedCount > 0 ? Math.round(stats.speedSum / stats.speedCount) : 0;

              // The single mastery calculation, shared with Home, Library
              // and Practice via lib/mastery.ts. This screen used to report
              // raw correct/total, so the same topic could read 40% here
              // and 51% two screens away.
              const state = computeMastery({
                correct: stats.correct,
                total: stats.total,
                attempts: stats.attempts,
                sessions: stats.sessionIds.size,
                lastPracticedMs: stats.lastPracticedTs || null,
                baselineResponseMs: baselineResponseMs,
              });

              const accuracy = state.mastery;
              const status = getTopicStatus(accuracy);
              const masteryTier = state.tier;
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
                masteryTier,
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

          // Routed through masteryTier (not the raw status/accuracy) so the
          // subject-level counts share the same sample-size-guarded
          // classification as the individual topic badges -- "weak" here
          // means needs_review specifically (evidenced, not just low-sample
          // noise), and "improving" covers both developing and strong.
          const masteredTopics = allTopics.filter((topic) => topic.masteryTier === "mastered");
          const improvingTopics = allTopics.filter(
            (topic) => topic.masteryTier === "developing" || topic.masteryTier === "strong"
          );
          const weakTopics = allTopics.filter((topic) => topic.masteryTier === "needs_review");

          // `topic.accuracy` is the modelled mastery, not raw correct/total,
          // so this average matches what Home and Practice report.
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
    // Shaped like the real stack (header + subject cards) so the layout does
    // not jump once the data lands.
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-44" />
        <div className="skeleton mt-8 h-[104px] w-full" />
        <div className="skeleton mt-6 h-[280px] w-full" />
        <div className="skeleton mt-4 h-[280px] w-full" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="app-page" style={{ maxWidth: "34rem" }}>
        <h1 className="t-page">Mastery map</h1>
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Sign in to see your map
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Every topic you have practised, scored, and ordered by what needs
            work.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <Link href="/login?redirect=/mastery-map" className="btn btn-primary">
              Log in
            </Link>
            <Link href="/signup?redirect=/mastery-map" className="btn btn-secondary">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page app-page-wide">
      <h1 className="t-page">Mastery map</h1>
      <p className="t-body mt-2 max-w-2xl">
        Every topic you have practised, scored. Open one to see why it scored
        that way and what to do about it.
      </p>

      {/* One headline number, not three. "Tracked topics" and "locked boss
          battles" were counts a student could read and act on in no way. */}
      {globalSummary.topicCount > 0 && (
        <div className="card mt-6 p-5 sm:p-6">
          <p
            className="text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]"
            style={{ color: "var(--text-1)" }}
          >
            {globalSummary.masteryAverage}% mastered
          </p>
          <div className="meter mt-4">
            <span
              style={{
                width: `${Math.min(100, Math.max(2, globalSummary.masteryAverage))}%`,
              }}
            />
          </div>
          <p className="t-meta mt-3">
            Across {globalSummary.topicCount}{" "}
            {globalSummary.topicCount === 1 ? "topic" : "topics"} in{" "}
            {subjects.length} {subjects.length === 1 ? "subject" : "subjects"}.
          </p>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="card mt-6 px-4 py-3"
          style={{
            borderColor: "rgb(255 107 107 / 0.3)",
            background: "var(--bad-soft)",
          }}
        >
          <p className="text-[14px]" style={{ color: "var(--text-1)" }}>
            {loadError}
          </p>
        </div>
      )}

      {subjects.length === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Nothing mapped yet
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Add something you are studying and answer a few questions. The map
            fills itself in from there.
          </p>
          <Link href="/home" className="btn btn-primary mt-6">
            Add material
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {subjects.map((subject) => (
            <section key={subject.deckId} className="card p-5 sm:p-6">
              {/* ---- Subject header ---- */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="t-section">{subject.subjectName}</p>
                  <h2
                    className="mt-1 truncate text-[19px] font-medium"
                    style={{ color: "var(--text-1)" }}
                  >
                    {subject.title}
                  </h2>
                  <p className="t-meta mt-1">
                    {subject.masteryPercent}% mastered ·{" "}
                    {subject.weakTopics.length} needing work
                  </p>
                </div>

                {/* The one action worth taking on this subject right now. */}
                {subject.dueQuestionCount > 0 && subject.dueReviewHref && (
                  <Link href={subject.dueReviewHref} className="btn btn-primary shrink-0">
                    Review {subject.dueQuestionCount} due
                    <ArrowRightIcon className="h-[18px] w-[18px]" />
                  </Link>
                )}
              </div>

              <div className="meter mt-4">
                <span
                  style={{
                    width: `${Math.min(100, Math.max(2, subject.masteryPercent))}%`,
                  }}
                />
              </div>

              {/* ---- Topics ----
                  One row each, collapsed. Every topic used to show four stat
                  tiles and FOUR buttons at once -- with a dozen topics that is
                  fifty controls on one screen, and no way to tell "Practice
                  this topic" from "Rematch weakness" from "Start Boss Battle".
                  Collapsed, a row answers "how am I doing"; opened, it answers
                  "why, and what do I do". */}
              <ul
                className="mt-5 divide-y"
                style={{ borderColor: "var(--line)" }}
              >
                {subject.allTopics.map((topic) => (
                  <li key={`${subject.deckId}-${topic.topic}`}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 py-3">
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate text-[15px]"
                            style={{ color: "var(--text-1)" }}
                          >
                            {topic.topic}
                          </span>
                          <span className="mt-1.5 flex items-center gap-2">
                            <span
                              className="meter"
                              style={{ maxWidth: "120px" }}
                              role="progressbar"
                              aria-valuenow={topic.accuracy}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${topic.topic}: ${topic.accuracy}% correct`}
                            >
                              <span
                                style={{
                                  width: `${Math.min(100, Math.max(2, topic.accuracy))}%`,
                                  background: tierMeterColor(topic.masteryTier),
                                }}
                              />
                            </span>
                            <span className="t-meta tabular-nums">
                              {topic.accuracy}%
                            </span>
                          </span>
                        </span>

                        <span className={`${tierChipClass(topic.masteryTier)} hidden shrink-0 sm:inline-flex`}>
                          {MASTERY_TIER_LABELS[topic.masteryTier]}
                        </span>
                        {(topic.reviewUrgency === "overdue" ||
                          topic.reviewUrgency === "due_soon") && (
                          <span className={`${reviewChipClass(topic.reviewUrgency)} shrink-0`}>
                            {topic.nextReviewLabel}
                          </span>
                        )}
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 12 12"
                          className="h-3 w-3 shrink-0 transition-transform duration-200 group-open:rotate-90"
                          fill="none"
                          stroke="var(--text-4)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 2l4 4-4 4" />
                        </svg>
                      </summary>

                      <div className="pb-4">
                        <p className="t-body">{topic.recommendedAction}</p>

                        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
                          {[
                            ["Typical mistake", topic.mistakeType],
                            ["Average speed", topic.averageSpeedLabel],
                            ["Last practised", topic.lastPracticedDate],
                            ["Next review", topic.nextReviewLabel],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-baseline gap-1.5">
                              <dt className="t-meta">{label}</dt>
                              <dd
                                className="text-[13px]"
                                style={{ color: "var(--text-2)" }}
                              >
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {/* One primary action. The other two are quiet. */}
                          <Link href={topic.practiceHref} className="btn btn-primary btn-sm">
                            Practise this
                          </Link>
                          <Link href={topic.rematchHref} className="btn btn-secondary btn-sm">
                            Just my mistakes
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleAskVyra(subject, topic)}
                            className="btn btn-quiet btn-sm"
                          >
                            Ask Vyra
                          </button>
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>

              {/* Kept because each one carries a REASON, which is the only
                  thing that made the old "Battle guidance" aside worth its
                  space. Capped at two. */}
              {subject.recommendedNextBattles.length > 0 && (
                <div
                  className="mt-5 border-t pt-4"
                  style={{ borderColor: "var(--line)" }}
                >
                  <h3 className="t-section">Worth doing next</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {subject.recommendedNextBattles.slice(0, 2).map((battle) => (
                      <li key={`${subject.deckId}-${battle.label}`}>
                        <Link
                          href={battle.href}
                          className="card-link flex items-center gap-3 px-4 py-3"
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className="block truncate text-[14px] font-medium"
                              style={{ color: "var(--text-1)" }}
                            >
                              {battle.label}
                            </span>
                            <span className="t-meta block truncate">
                              {battle.reason}
                            </span>
                          </span>
                          <ArrowRightIcon className="h-4 w-4 shrink-0 opacity-40" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {subject.bossLocked && subject.lockedBossReason && (
                <p className="t-meta mt-4">{subject.lockedBossReason}</p>
              )}
            </section>
          ))}
        </div>
      )}

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
    </div>
  );
}

function MasteryMapFallback() {
  return (
    <div className="app-page">
      <div className="skeleton h-9 w-44" />
      <div className="skeleton mt-8 h-[104px] w-full" />
      <div className="skeleton mt-6 h-[280px] w-full" />
    </div>
  );
}

export default function MasteryMapPage() {
  return (
    <Suspense fallback={<MasteryMapFallback />}>
      <MasteryMapPageContent />
    </Suspense>
  );
}
