// Recording what a student just showed they know, and deciding when they
// should see it again.
//
// Two writers feed this: a finished study session (/api/battle/finish) and a
// flashcard review (/api/flashcards/review). Both used to have their own
// copy of the topic update, each doing a read and a write per topic and per
// question in sequence -- a 20-question session cost about sixty database
// round trips before the student saw their result.
//
// It also changes WHEN a topic comes back. The schedule used to be a lookup
// table on lifetime accuracy: under 60% came back in a day, under 85% in
// three, anything else in 7-21. A student who went 2/10 in September and
// 10/10 every week since was still "weak" and still due every day. The
// review date now comes from the same model that produces the mastery
// number (lib/mastery.ts): stability grows with spaced, successful
// sessions, and a topic is due when the odds of recalling it fall to 85%.
// One model, so the number a student sees and the day the topic returns
// cannot disagree.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMastery, type MasteryTier } from "@/lib/mastery";
import { MASTERY_TIER_ORDER } from "@/lib/masteryTiers";
import { gradeFromAnswer, INITIAL_SM2, reviewSm2 } from "@/lib/sm2";
import { getQuestionStatus, type TopicStatus } from "@/lib/srsSchedule";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Gaps shorter than this are the same sitting, not a new spaced session. */
const SAME_SITTING_MS = 60 * 60 * 1000;

export type Confidence = "sure" | "unsure" | "guess";

export type TopicDelta = {
  correct: number;
  total: number;
  recoveries: number;
  /** Answers marked "sure" that were wrong. */
  confidentMisses: number;
};

export type TopicRowState = {
  correct_count: number | null;
  total_count: number | null;
  attempts: number | null;
  recoveries: number | null;
  confident_misses?: number | null;
  last_practiced_at: string | null;
  next_review_at: string | null;
};

export function statusForTier(tier: MasteryTier): TopicStatus {
  if (tier === "needs_review") return "weak";
  if (tier === "developing") return "improving";
  return "mastered";
}

/**
 * The next state of one topic's schedule row.
 *
 * `session` says whether this evidence is a new spaced session (a finished
 * study session always is) or possibly part of one already counted (a
 * flashcard reviewed five minutes after the last one is not a second
 * spaced repetition, and counting it as one would inflate stability).
 *
 * A misconception -- a confident wrong answer -- halves the interval: it is
 * the thing most worth re-testing soon, and a student who was sure is the
 * student least likely to go back to it on their own.
 */
export function nextTopicState(args: {
  existing: TopicRowState | null;
  delta: TopicDelta;
  now: number;
  session: "new" | "auto";
}): {
  row: {
    status: TopicStatus;
    correct_count: number;
    total_count: number;
    attempts: number;
    recoveries: number;
    confident_misses: number;
    last_practiced_at: string;
    next_review_at: string;
  };
  tierBefore: MasteryTier;
  tierAfter: MasteryTier;
  wasDue: boolean;
} {
  const { existing, delta, now } = args;

  const lastMs = existing?.last_practiced_at ? Date.parse(existing.last_practiced_at) : null;
  const isNewSitting =
    args.session === "new" || lastMs === null || now - lastMs >= SAME_SITTING_MS;

  const correct = (existing?.correct_count ?? 0) + delta.correct;
  const totalCount = (existing?.total_count ?? 0) + delta.total;
  const attempts = (existing?.attempts ?? 0) + (isNewSitting ? 1 : 0);
  const recoveries = (existing?.recoveries ?? 0) + delta.recoveries;
  const confidentMisses = (existing?.confident_misses ?? 0) + delta.confidentMisses;

  const before = computeMastery({
    correct: existing?.correct_count ?? 0,
    total: existing?.total_count ?? 0,
    sessions: existing?.attempts ?? 0,
    recoveries: existing?.recoveries ?? 0,
    lastPracticedMs: lastMs,
    now,
  });

  const after = computeMastery({
    correct,
    total: totalCount,
    sessions: Math.max(1, attempts),
    recoveries,
    lastPracticedMs: now,
    now,
  });

  let intervalMs = Math.max(0, (after.dueAtMs ?? now) - now);
  if (delta.confidentMisses > 0) intervalMs /= 2;
  // Never "due the instant you finish". Even a topic that went badly is
  // worth a real gap before the retest -- that gap is what makes it
  // retrieval rather than re-reading the explanation you just saw.
  intervalMs = Math.max(intervalMs, 4 * 60 * 60 * 1000);
  intervalMs = Math.min(intervalMs, 180 * DAY_MS);

  return {
    row: {
      status: statusForTier(after.tier),
      correct_count: correct,
      total_count: totalCount,
      attempts,
      recoveries,
      confident_misses: confidentMisses,
      last_practiced_at: new Date(now).toISOString(),
      next_review_at: new Date(now + intervalMs).toISOString(),
    },
    tierBefore: before.tier,
    tierAfter: after.tier,
    wasDue: Boolean(existing?.next_review_at && Date.parse(existing.next_review_at) <= now),
  };
}

type Owner = { userId: string | null; playerName: string };

// Typed loosely on purpose: PostgREST's builder types recurse deeply enough
// that a generic constraint over them hits TypeScript's instantiation limit.
type Filterable = {
  eq(column: string, value: unknown): Filterable;
  is(column: string, value: null): Filterable;
};

function scopeToOwner<Q>(query: Q, owner: Owner): Q {
  const filterable = query as unknown as Filterable;
  const scoped = owner.userId
    ? filterable.eq("user_id", owner.userId)
    : filterable.is("user_id", null).eq("player_name", owner.playerName);
  return scoped as unknown as Q;
}

/**
 * Writes topic evidence for one deck. One read for every topic, then the
 * writes in parallel. Returns what the session achieved, for progression.
 */
export async function recordTopicEvidence(
  supabase: SupabaseClient,
  args: {
    owner: Owner;
    deckId: string;
    perTopic: Map<string, TopicDelta>;
    session: "new" | "auto";
    now?: number;
  }
): Promise<{ topicsImproved: number; clearedReviews: boolean }> {
  const { owner, deckId, perTopic, session } = args;
  const now = args.now ?? Date.now();
  if (perTopic.size === 0) return { topicsImproved: 0, clearedReviews: false };

  const topics = Array.from(perTopic.keys());
  const baseSelect =
    "id, topic, correct_count, total_count, attempts, recoveries, last_practiced_at, next_review_at";

  // confident_misses arrives with 20260918_02; read it when it is there,
  // and carry on without it when it is not.
  let existingRows: Array<TopicRowState & { id: string; topic: string }> = [];
  let hasConfidenceColumn = true;
  {
    const withConfidence = await scopeToOwner(
      supabase
        .from("topic_review_schedule")
        .select(`${baseSelect}, confident_misses`)
        .eq("deck_id", deckId)
        .in("topic", topics),
      owner
    );
    if (withConfidence.error) {
      hasConfidenceColumn = false;
      const plain = await scopeToOwner(
        supabase
          .from("topic_review_schedule")
          .select(baseSelect)
          .eq("deck_id", deckId)
          .in("topic", topics),
        owner
      );
      existingRows = (plain.data || []) as typeof existingRows;
    } else {
      existingRows = (withConfidence.data || []) as typeof existingRows;
    }
  }

  const byTopic = new Map(existingRows.map((row) => [row.topic, row]));
  let topicsImproved = 0;
  let clearedReviews = false;
  const inserts: Record<string, unknown>[] = [];
  const updates: Array<PromiseLike<unknown>> = [];
  const nowIso = new Date(now).toISOString();

  for (const [topic, delta] of perTopic) {
    const existing = byTopic.get(topic) ?? null;
    const next = nextTopicState({ existing, delta, now, session });

    if (MASTERY_TIER_ORDER.indexOf(next.tierAfter) > MASTERY_TIER_ORDER.indexOf(next.tierBefore)) {
      topicsImproved += 1;
    }
    if (next.wasDue) clearedReviews = true;

    const row: Record<string, unknown> = {
      ...next.row,
      notified_at: null,
      updated_at: nowIso,
    };
    if (!hasConfidenceColumn) delete row.confident_misses;

    if (existing && (existing as { id?: string }).id) {
      updates.push(
        supabase
          .from("topic_review_schedule")
          .update(row)
          .eq("id", (existing as { id: string }).id)
      );
    } else {
      inserts.push({
        ...row,
        user_id: owner.userId,
        player_name: owner.userId ? null : owner.playerName,
        deck_id: deckId,
        topic,
      });
    }
  }

  if (inserts.length > 0) {
    updates.push(supabase.from("topic_review_schedule").insert(inserts));
  }
  await Promise.all(updates);

  return { topicsImproved, clearedReviews };
}

export type AnswerEvidence = {
  questionId: string;
  isCorrect: boolean;
  responseTimeMs: number;
  confidence?: Confidence | null;
  recovered: boolean;
};

/**
 * Per-question schedule (SM-2), batched the same way. The grade reflects
 * how the answer was reached as well as whether it was right: a correct
 * guess is not a recall, and a confident miss is the heaviest lapse there
 * is.
 */
export async function recordQuestionEvidence(
  supabase: SupabaseClient,
  args: { owner: Owner; deckId: string; answers: AnswerEvidence[]; now?: number }
): Promise<void> {
  const { owner, deckId, answers } = args;
  if (answers.length === 0) return;
  const now = args.now ?? Date.now();
  const nowIso = new Date(now).toISOString();

  const timed = answers.map((a) => a.responseTimeMs).filter((ms) => ms > 0);
  const baselineMs =
    timed.length >= 3 ? timed.reduce((sum, ms) => sum + ms, 0) / timed.length : null;

  const { data } = await scopeToOwner(
    supabase
      .from("question_review_schedule")
      .select(
        "id, question_id, correct_streak, correct_count, total_count, recoveries, ease_factor, interval_days, repetitions"
      )
      .eq("deck_id", deckId)
      .in(
        "question_id",
        answers.map((a) => a.questionId)
      ),
    owner
  );

  type Existing = {
    id: string;
    question_id: string;
    correct_streak: number | null;
    correct_count: number | null;
    total_count: number | null;
    recoveries: number | null;
    ease_factor: number | null;
    interval_days: number | null;
    repetitions: number | null;
  };
  const byQuestion = new Map(((data || []) as Existing[]).map((row) => [row.question_id, row]));

  const writes: Array<PromiseLike<unknown>> = [];
  const inserts: Record<string, unknown>[] = [];

  for (const answer of answers) {
    const existing = byQuestion.get(answer.questionId);
    const correctStreak = answer.isCorrect ? (existing?.correct_streak ?? 0) + 1 : 0;

    // A recovered question is graded as a pass on the lapse ladder -- the
    // student did fix it -- but as help-assisted, so it grows slowly.
    const grade = gradeFromAnswer({
      isCorrect: answer.isCorrect || answer.recovered,
      responseMs: answer.responseTimeMs,
      baselineMs,
      usedHelp: answer.recovered,
      confidence: answer.confidence ?? null,
    });

    const sm2 = reviewSm2(
      {
        intervalDays: existing?.interval_days ?? INITIAL_SM2.intervalDays,
        easeFactor: Number(existing?.ease_factor ?? INITIAL_SM2.easeFactor),
        repetitions: existing?.repetitions ?? INITIAL_SM2.repetitions,
        lastReviewedMs: now,
      },
      grade,
      now
    );

    const row = {
      status: getQuestionStatus(correctStreak),
      correct_streak: correctStreak,
      correct_count: (existing?.correct_count ?? 0) + (answer.isCorrect ? 1 : 0),
      total_count: (existing?.total_count ?? 0) + 1,
      recoveries: (existing?.recoveries ?? 0) + (!answer.isCorrect && answer.recovered ? 1 : 0),
      ease_factor: sm2.easeFactor,
      interval_days: sm2.intervalDays,
      repetitions: sm2.repetitions,
      last_practiced_at: nowIso,
      next_review_at: new Date(now + sm2.intervalDays * DAY_MS).toISOString(),
      updated_at: nowIso,
    };

    if (existing) {
      writes.push(supabase.from("question_review_schedule").update(row).eq("id", existing.id));
    } else {
      inserts.push({
        ...row,
        user_id: owner.userId,
        player_name: owner.userId ? null : owner.playerName,
        deck_id: deckId,
        question_id: answer.questionId,
      });
    }
  }

  if (inserts.length > 0) {
    writes.push(supabase.from("question_review_schedule").insert(inserts));
  }
  await Promise.all(writes);
}
