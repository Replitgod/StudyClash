import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkInMemoryRateLimit,
  generateOpaqueToken,
  getBearerToken,
  getClientIpAddress,
  hashIdentifier,
} from "@/lib/server/apiUtils";
import { getQuestionStatus, getReviewIntervalDays, getTopicStatus } from "@/lib/srsSchedule";

const CHALLENGE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Battle is intentionally open to guests (no login required), so auth here
// is optional: if a session token is present we stamp the match with the
// real user_id (so pages like Mastery Map can query by ownership instead of
// fragile player_name string-matching); if not, the match is saved as a
// guest match exactly as before.
async function resolveOptionalUserId(request: NextRequest): Promise<string | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  return user?.id || null;
}

type AnswerPayload = {
  questionId: string;
  selectedAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
};

type FinishBattlePayload = {
  deckId: string;
  playerName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeTakenSeconds: number;
  answers: AnswerPayload[];
  challengeFromMatchId?: string;
};

type MatchLite = {
  id: string;
  player_name: string;
  score: number;
  time_taken_seconds: number;
};

function buildAnswerSignature(answer: AnswerPayload): string {
  return [
    answer.questionId,
    answer.selectedAnswer,
    answer.isCorrect ? "1" : "0",
    String(Math.round(answer.responseTimeMs)),
  ].join("|");
}

// Mirrors the exact scoring formula in app/battle/[deckId]/page.tsx and
// app/demo/battle/page.tsx (calculatePointsForStreak) so the leaderboard
// score is always recomputed server-side from the validated answer
// sequence, never trusted from the client. Deterministic given the answers'
// submission order and correctness, both of which are already verified
// above against the deck's real questions.
const BASE_POINTS_PER_CORRECT = 100;
const STREAK_BONUS_TIER_1 = 25; // 3+ streak
const STREAK_BONUS_TIER_2 = 50; // 5+ streak

function calculatePointsForStreak(streak: number): number {
  if (streak >= 5) return BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_2;
  if (streak >= 3) return BASE_POINTS_PER_CORRECT + STREAK_BONUS_TIER_1;
  return BASE_POINTS_PER_CORRECT;
}

function computeAuthoritativeScore(answers: AnswerPayload[]): number {
  let streak = 0;
  let score = 0;

  for (const answer of answers) {
    if (answer.isCorrect) {
      streak += 1;
      score += calculatePointsForStreak(streak);
    } else {
      streak = 0;
    }
  }

  return score;
}

// Generous ceilings, not realism checks -- these only exist to reject
// obviously corrupted/overflowed payloads, not to second-guess a genuinely
// slow thinker. The real anti-cheat check is the aggregate one below
// (sum of per-answer times can't exceed the submitted total).
const MAX_RESPONSE_TIME_MS = 60 * 60 * 1000; // 1 hour on a single question
const MAX_TIME_TAKEN_SECONDS = 6 * 60 * 60; // 6 hours for a whole battle
const TIME_CONSISTENCY_TOLERANCE_MS = 5000;

function isValidAnswerPayload(value: unknown): value is AnswerPayload {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.questionId === "string" &&
    typeof candidate.selectedAnswer === "string" &&
    typeof candidate.isCorrect === "boolean" &&
    typeof candidate.responseTimeMs === "number" &&
    Number.isFinite(candidate.responseTimeMs) &&
    candidate.responseTimeMs >= 0 &&
    candidate.responseTimeMs <= MAX_RESPONSE_TIME_MS
  );
}

export async function POST(req: NextRequest) {
  try {
    const authenticatedUserId = await resolveOptionalUserId(req);
    const ipHash = hashIdentifier(getClientIpAddress(req));
    const rateLimit = checkInMemoryRateLimit({
      key: `battle-finish:${ipHash}`,
      limit: 30,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many battle submissions. Please slow down and retry." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const body = (await req.json()) as Partial<FinishBattlePayload>;

    if (
      !body.deckId ||
      !body.playerName ||
      typeof body.score !== "number" ||
      typeof body.totalQuestions !== "number" ||
      typeof body.correctAnswers !== "number" ||
      typeof body.timeTakenSeconds !== "number" ||
      !Array.isArray(body.answers)
    ) {
      return NextResponse.json(
        { error: "Missing required battle results." },
        { status: 400 }
      );
    }

    if (!body.answers.every(isValidAnswerPayload)) {
      return NextResponse.json(
        { error: "Battle answers were not valid." },
        { status: 400 }
      );
    }

    if (body.totalQuestions <= 0) {
      return NextResponse.json(
        { error: "This battle did not include a valid question count." },
        { status: 400 }
      );
    }

    if (body.answers.length !== body.totalQuestions) {
      return NextResponse.json(
        { error: "This battle was not fully completed before submission." },
        { status: 400 }
      );
    }

    const uniqueQuestionIds = new Set(body.answers.map((answer) => answer.questionId));

    if (uniqueQuestionIds.size !== body.answers.length) {
      return NextResponse.json(
        { error: "Duplicate answers were detected in this battle." },
        { status: 400 }
      );
    }

    const computedCorrectAnswers = body.answers.filter((answer) => answer.isCorrect).length;

    if (computedCorrectAnswers !== body.correctAnswers) {
      return NextResponse.json(
        { error: "Correct-answer totals did not match the submitted answers." },
        { status: 400 }
      );
    }

    const { data: deckData, error: deckError } = await supabase
      .from("decks")
      .select("id")
      .eq("id", body.deckId)
      .single();

    if (deckError || !deckData) {
      return NextResponse.json(
        { error: "This deck could not be found." },
        { status: 404 }
      );
    }

    const { data: questionRows, error: questionsError } = await supabase
      .from("questions")
      .select("id, correct_answer, topic")
      .eq("deck_id", body.deckId)
      .in("id", Array.from(uniqueQuestionIds));

    if (questionsError || !questionRows) {
      return NextResponse.json(
        { error: questionsError?.message || "Failed to validate battle questions." },
        { status: 500 }
      );
    }

    if (questionRows.length !== body.answers.length) {
      return NextResponse.json(
        { error: "Some submitted answers did not belong to this deck." },
        { status: 400 }
      );
    }

    const questionById = new Map(
      questionRows.map(
        (question: { id: string; correct_answer: string; topic?: string | null }) => [
          question.id,
          question,
        ]
      )
    );

    for (const answer of body.answers) {
      const question = questionById.get(answer.questionId);

      if (!question) {
        return NextResponse.json(
          { error: "A submitted answer referenced an unknown question." },
          { status: 400 }
        );
      }

      const expectedIsCorrect = answer.selectedAnswer === question.correct_answer;
      if (expectedIsCorrect !== answer.isCorrect) {
        return NextResponse.json(
          { error: "A submitted answer had an invalid correctness flag." },
          { status: 400 }
        );
      }
    }

    if (body.timeTakenSeconds < 0 || body.timeTakenSeconds > MAX_TIME_TAKEN_SECONDS) {
      return NextResponse.json(
        { error: "This battle reported an invalid completion time." },
        { status: 400 }
      );
    }

    // The client derives every answer's responseTimeMs from the same
    // monotonically increasing elapsedSeconds clock that timeTakenSeconds is
    // read from at submission (app/battle/[deckId]/page.tsx), so the sum of
    // per-answer times can never legitimately exceed the total. A client
    // that shrinks only timeTakenSeconds -- to win a leaderboard/tournament
    // tiebreak without redoing the whole answer timeline -- trips this.
    const sumResponseTimeMs = body.answers.reduce(
      (total, answer) => total + answer.responseTimeMs,
      0
    );

    if (sumResponseTimeMs > body.timeTakenSeconds * 1000 + TIME_CONSISTENCY_TOLERANCE_MS) {
      return NextResponse.json(
        { error: "This battle's timing did not add up." },
        { status: 400 }
      );
    }

    // Never trust the client-submitted score for storage/leaderboards --
    // recompute it from the server-validated answer sequence using the same
    // formula the client uses, so a crafted payload can't forge a leaderboard
    // score or boss-battle win.
    const authoritativeScore = computeAuthoritativeScore(body.answers);

    // Deduplicate accidental rapid re-submits of the exact same completed
    // battle payload (for example, retry taps after transient network lag).
    const dedupeWindowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: duplicateCandidates } = await supabase
      .from("matches")
      .select("id, created_at")
      .eq("deck_id", body.deckId)
      .eq("player_name", body.playerName)
      .eq("score", authoritativeScore)
      .eq("total_questions", body.totalQuestions)
      .eq("correct_answers", body.correctAnswers)
      .eq("time_taken_seconds", body.timeTakenSeconds)
      .gte("created_at", dedupeWindowStart)
      .order("created_at", { ascending: false })
      .limit(3);

    if (duplicateCandidates && duplicateCandidates.length > 0) {
      const submittedSignatures = new Set(
        body.answers.map((answer) => buildAnswerSignature(answer))
      );

      for (const candidate of duplicateCandidates) {
        const { data: candidateAnswers, error: candidateAnswersError } = await supabase
          .from("match_answers")
          .select("question_id, selected_answer, is_correct, response_time_ms")
          .eq("match_id", candidate.id);

        if (candidateAnswersError || !candidateAnswers) {
          continue;
        }

        if (candidateAnswers.length !== body.answers.length) {
          continue;
        }

        const candidateSignatures = new Set(
          candidateAnswers.map((answer) =>
            [
              answer.question_id,
              answer.selected_answer,
              answer.is_correct ? "1" : "0",
              String(Math.round(answer.response_time_ms || 0)),
            ].join("|")
          )
        );

        const isExactDuplicate =
          submittedSignatures.size === candidateSignatures.size &&
          Array.from(submittedSignatures).every((signature) =>
            candidateSignatures.has(signature)
          );

        if (isExactDuplicate) {
          return NextResponse.json({ matchId: candidate.id, deduped: true });
        }
      }
    }

    const { data: previousTopMatch } = await supabase
      .from("matches")
      .select("id, player_name, score, time_taken_seconds")
      .eq("deck_id", body.deckId)
      .order("score", { ascending: false })
      .order("time_taken_seconds", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .insert({
        deck_id: body.deckId,
        player_name: body.playerName,
        user_id: authenticatedUserId,
        score: authoritativeScore,
        total_questions: body.totalQuestions,
        correct_answers: body.correctAnswers,
        time_taken_seconds: body.timeTakenSeconds,
      })
      .select("id")
      .single();

    if (matchError || !matchData) {
      return NextResponse.json(
        { error: matchError?.message || "Failed to save your match." },
        { status: 500 }
      );
    }

    if (body.answers.length > 0) {
      const answerRows = body.answers.map((answer) => ({
        match_id: matchData.id,
        question_id: answer.questionId,
        selected_answer: answer.selectedAnswer,
        is_correct: answer.isCorrect,
        response_time_ms: answer.responseTimeMs,
      }));

      const { error: answersError } = await supabase
        .from("match_answers")
        .insert(answerRows);

      if (answersError) {
        await supabase.from("matches").delete().eq("id", matchData.id);

        return NextResponse.json(
          { error: answersError.message },
          { status: 500 }
        );
      }
    }

    // Best-effort: roll this match's answers into each answered topic's
    // spaced-repetition schedule so the SRS cron (app/api/cron/srs-reviews)
    // can later remind the student when it comes due. Never blocks the
    // battle-finish response -- the match itself is already saved above.
    try {
      const questionTopics = new Map<string, string>();
      for (const question of questionRows as Array<{
        id: string;
        topic?: string | null;
      }>) {
        if (question.topic) {
          questionTopics.set(question.id, question.topic);
        }
      }

      await updateTopicReviewSchedule({
        deckId: body.deckId,
        userId: authenticatedUserId,
        playerName: body.playerName,
        answers: body.answers,
        questionTopics,
      });
    } catch {
      // topic_review_schedule may not be deployed yet.
    }

    // Best-effort: same idea as the topic-level schedule above, but tracked
    // per individual question (question_review_schedule) so weak-topic
    // rematch can target the exact questions a student is missing instead
    // of "anything tagged with this topic label." See getQuestionStatus in
    // lib/srsSchedule.ts.
    try {
      await updateQuestionReviewSchedule({
        deckId: body.deckId,
        userId: authenticatedUserId,
        playerName: body.playerName,
        answers: body.answers,
      });
    } catch {
      // question_review_schedule may not be deployed yet.
    }

    let crownTaken = false;
    const normalizedPreviousTop = previousTopMatch as MatchLite | null;

    if (
      normalizedPreviousTop &&
      normalizedPreviousTop.player_name.trim().toLowerCase() !==
        body.playerName.trim().toLowerCase() &&
      didBeatMatch({
        score: authoritativeScore,
        timeTakenSeconds: body.timeTakenSeconds,
        previous: normalizedPreviousTop,
      })
    ) {
      crownTaken = true;

      const challengeToken = generateOpaqueToken();
      const challengeTokenExpiresAt = new Date(Date.now() + CHALLENGE_TOKEN_TTL_MS).toISOString();
      await supabase
        .from("matches")
        .update({ share_token: challengeToken, share_token_expires_at: challengeTokenExpiresAt })
        .eq("id", matchData.id);

      const actionHref = `/challenge/${challengeToken}`;
      const message = `${body.playerName} beat your top score on this deck. Tap to rematch.`;

      try {
        await supabase.from("email_notification_queue").insert({
          recipient_player_name: normalizedPreviousTop.player_name,
          event_type: "crown_taken",
          subject: "Your StudyJoust crown was taken",
          body: message,
          action_href: actionHref,
          metadata: {
            deckId: body.deckId,
            oldTopMatchId: normalizedPreviousTop.id,
            newTopMatchId: matchData.id,
            challengerName: body.playerName,
          },
        });
      } catch {
        // Queue table may not be deployed yet.
      }

      try {
        await supabase.from("challenge_notifications").insert({
          target_player_name: normalizedPreviousTop.player_name,
          source_match_id: matchData.id,
          deck_id: body.deckId,
          event_type: "crown_taken",
          title: "Your crown was taken",
          message,
          action_href: actionHref,
          metadata: {
            oldTopMatchId: normalizedPreviousTop.id,
            newTopMatchId: matchData.id,
          },
        });
      } catch {
        // Notification table may not be deployed yet.
      }
    }

    return NextResponse.json({ matchId: matchData.id, crownTaken });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to finish battle.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function didBeatMatch(args: {
  score: number;
  timeTakenSeconds: number;
  previous: MatchLite;
}): boolean {
  const { score, timeTakenSeconds, previous } = args;
  if (score > previous.score) return true;
  if (score < previous.score) return false;
  return timeTakenSeconds < previous.time_taken_seconds;
}

// Rolls this match's per-topic results into topic_review_schedule: a
// cumulative correct/total count per (owner, deck, topic) drives the same
// weak/improving/mastered thresholds and interval math as Mastery Map (see
// lib/srsSchedule.ts), so the async reminder cron agrees with what the
// student sees on that dashboard. Read-then-write rather than an atomic
// upsert -- battle finish isn't a high-concurrency path (one write per
// student per completed battle), so this stays simple.
async function updateTopicReviewSchedule(args: {
  deckId: string;
  userId: string | null;
  playerName: string;
  answers: AnswerPayload[];
  questionTopics: Map<string, string>;
}): Promise<void> {
  const { deckId, userId, playerName, answers, questionTopics } = args;

  const perTopic = new Map<string, { correct: number; total: number }>();
  for (const answer of answers) {
    const topic = questionTopics.get(answer.questionId);
    if (!topic) continue;
    const bucket = perTopic.get(topic) || { correct: 0, total: 0 };
    bucket.total += 1;
    if (answer.isCorrect) bucket.correct += 1;
    perTopic.set(topic, bucket);
  }

  if (perTopic.size === 0) return;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  for (const [topic, delta] of perTopic.entries()) {
    let existingQuery = supabase
      .from("topic_review_schedule")
      .select("id, correct_count, total_count, attempts")
      .eq("deck_id", deckId)
      .eq("topic", topic);

    existingQuery = userId
      ? existingQuery.eq("user_id", userId)
      : existingQuery.is("user_id", null).eq("player_name", playerName);

    const { data: existing } = await existingQuery.maybeSingle();

    const correctCount = (existing?.correct_count || 0) + delta.correct;
    const totalCount = (existing?.total_count || 0) + delta.total;
    const attempts = (existing?.attempts || 0) + 1;
    const accuracy = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
    const status = getTopicStatus(accuracy);
    const intervalDays = getReviewIntervalDays(status, attempts);
    const nextReviewAt = new Date(nowMs + intervalDays * 24 * 60 * 60 * 1000).toISOString();

    const row = {
      user_id: userId,
      player_name: userId ? null : playerName,
      deck_id: deckId,
      topic,
      status,
      correct_count: correctCount,
      total_count: totalCount,
      attempts,
      last_practiced_at: nowIso,
      next_review_at: nextReviewAt,
      notified_at: null,
      updated_at: nowIso,
    };

    if (existing?.id) {
      await supabase.from("topic_review_schedule").update(row).eq("id", existing.id);
    } else {
      await supabase.from("topic_review_schedule").insert(row);
    }
  }
}

// Per-question sibling of updateTopicReviewSchedule above. Status comes
// from a correct-streak (getQuestionStatus), not accuracy -- a single
// question's accuracy over a handful of attempts is too noisy to threshold
// the way topic-level cumulative accuracy can. Interval growth reuses the
// same getReviewIntervalDays math the topic schedule uses. Same
// read-then-write justification as the topic version: one write per
// student per completed battle, bounded by questions-per-battle.
async function updateQuestionReviewSchedule(args: {
  deckId: string;
  userId: string | null;
  playerName: string;
  answers: AnswerPayload[];
}): Promise<void> {
  const { deckId, userId, playerName, answers } = args;

  if (answers.length === 0) return;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  for (const answer of answers) {
    let existingQuery = supabase
      .from("question_review_schedule")
      .select("id, correct_streak, correct_count, total_count")
      .eq("deck_id", deckId)
      .eq("question_id", answer.questionId);

    existingQuery = userId
      ? existingQuery.eq("user_id", userId)
      : existingQuery.is("user_id", null).eq("player_name", playerName);

    const { data: existing } = await existingQuery.maybeSingle();

    const correctStreak = answer.isCorrect
      ? (existing?.correct_streak || 0) + 1
      : 0;
    const correctCount = (existing?.correct_count || 0) + (answer.isCorrect ? 1 : 0);
    const totalCount = (existing?.total_count || 0) + 1;
    const status = getQuestionStatus(correctStreak);
    const intervalDays = getReviewIntervalDays(status, totalCount);
    const nextReviewAt = new Date(nowMs + intervalDays * 24 * 60 * 60 * 1000).toISOString();

    const row = {
      user_id: userId,
      player_name: userId ? null : playerName,
      deck_id: deckId,
      question_id: answer.questionId,
      status,
      correct_streak: correctStreak,
      correct_count: correctCount,
      total_count: totalCount,
      last_practiced_at: nowIso,
      next_review_at: nextReviewAt,
      updated_at: nowIso,
    };

    if (existing?.id) {
      await supabase.from("question_review_schedule").update(row).eq("id", existing.id);
    } else {
      await supabase.from("question_review_schedule").insert(row);
    }
  }
}