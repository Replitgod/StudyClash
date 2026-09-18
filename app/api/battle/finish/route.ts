import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  checkInMemoryRateLimit,
  generateOpaqueToken,
  getBearerToken,
  getClientIpAddress,
  hashIdentifier,
} from "@/lib/server/apiUtils";
import { recordSessionProgress } from "@/lib/server/progression";
import { recordRatedResult, type RatedOpponent } from "@/lib/server/ratings";
import {
  recordQuestionEvidence,
  recordTopicEvidence,
  type Confidence,
  type TopicDelta,
} from "@/lib/server/studyEvidence";

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
  /** How sure the student said they were, before seeing the answer. */
  confidence?: Confidence;
};

const CONFIDENCE_VALUES: ReadonlySet<string> = new Set(["sure", "unsure", "guess"]);

type FinishBattlePayload = {
  deckId: string;
  playerName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeTakenSeconds: number;
  answers: AnswerPayload[];
  challengeFromMatchId?: string;
  clientRequestId?: string;
  /**
   * Questions the student missed and then got right on a follow-up (see
   * app/api/explain-mistake). Credited to mastery as an extra spaced
   * repetition, never as an extra correct answer -- the miss still stands.
   */
  recoveredQuestionIds?: string[];
  /**
   * The student's local date (YYYY-MM-DD). Streaks and daily quests are
   * about the student's day; deriving it from the server clock would roll a
   * late-evening session into tomorrow for anyone west of the server.
   */
  localDate?: string;
  /**
   * Present only for a rated battle. The opponent's *strength* is never
   * taken from here -- the server resolves it from the ghost match or the
   * bot difficulty (see lib/server/ratings.ts). This only says which kind
   * of opponent to go and look up.
   */
  ratedOpponent?: { kind: "bot" | "ghost"; difficulty?: string; matchId?: string };
  /** The opponent's final score in a rated battle, if there was one. */
  opponentScore?: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    candidate.responseTimeMs <= MAX_RESPONSE_TIME_MS &&
    (candidate.confidence === undefined ||
      candidate.confidence === null ||
      (typeof candidate.confidence === "string" && CONFIDENCE_VALUES.has(candidate.confidence)))
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
        { error: "Too many sessions saved at once. Wait a moment and try again." },
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
        { error: "This session was missing some results, so it could not be saved." },
        { status: 400 }
      );
    }

    if (!body.answers.every(isValidAnswerPayload)) {
      return NextResponse.json(
        { error: "Some answers in this session could not be read, so it was not saved." },
        { status: 400 }
      );
    }

    if (body.totalQuestions <= 0) {
      return NextResponse.json(
        { error: "This session had no questions to save." },
        { status: 400 }
      );
    }

    if (body.answers.length !== body.totalQuestions) {
      return NextResponse.json(
        { error: "Finish every question before saving the session." },
        { status: 400 }
      );
    }

    const uniqueQuestionIds = new Set(body.answers.map((answer) => answer.questionId));

    if (uniqueQuestionIds.size !== body.answers.length) {
      return NextResponse.json(
        { error: "This session answered the same question twice, so it could not be saved." },
        { status: 400 }
      );
    }

    const computedCorrectAnswers = body.answers.filter((answer) => answer.isCorrect).length;

    if (computedCorrectAnswers !== body.correctAnswers) {
      return NextResponse.json(
        { error: "Some answers could not be checked. Reload and try again." },
        { status: 400 }
      );
    }

    const { data: deckData, error: deckError } = await supabase
      .from("decks")
      // course_name is the subject a ranked result is filed under. Ranks
      // are per subject: being strong at Algebra says nothing about
      // Chemistry, and one global number would hide both.
      .select("id, course_name")
      .eq("id", body.deckId)
      .single();

    if (deckError || !deckData) {
      return NextResponse.json(
        { error: "This study set no longer exists." },
        { status: 404 }
      );
    }

    const deckSubject = (deckData.course_name || "").trim() || "overall";

    const { data: questionRows, error: questionsError } = await supabase
      .from("questions")
      .select("id, correct_answer, topic")
      .eq("deck_id", body.deckId)
      .in("id", Array.from(uniqueQuestionIds));

    if (questionsError || !questionRows) {
      return NextResponse.json(
        { error: "We could not check this session's answers. Try again." },
        { status: 500 }
      );
    }

    if (questionRows.length !== body.answers.length) {
      return NextResponse.json(
        { error: "Some answers did not match this study set. Reload and try again." },
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
          { error: "Some answers did not match this study set. Reload and try again." },
          { status: 400 }
        );
      }

      const expectedIsCorrect = answer.selectedAnswer === question.correct_answer;
      if (expectedIsCorrect !== answer.isCorrect) {
        return NextResponse.json(
          { error: "Some answers could not be checked. Reload and try again." },
          { status: 400 }
        );
      }
    }

    if (body.timeTakenSeconds < 0 || body.timeTakenSeconds > MAX_TIME_TAKEN_SECONDS) {
      return NextResponse.json(
        { error: "This session reported an impossible time, so it was not saved." },
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
        { error: "This session's timing did not add up, so it was not saved." },
        { status: 400 }
      );
    }

    // Never trust the client-submitted score for storage/leaderboards --
    // recompute it from the server-validated answer sequence using the same
    // formula the client uses, so a crafted payload can't forge a leaderboard
    // score or boss-battle win.
    const authoritativeScore = computeAuthoritativeScore(body.answers);

    const clientRequestId =
      typeof body.clientRequestId === "string" && UUID_RE.test(body.clientRequestId)
        ? body.clientRequestId
        : null;

    // Fast path: this exact client-generated request already succeeded
    // (e.g. the client retried after a slow/dropped response). Cheaper than
    // the signature-based dedupe below, and catches it before doing any of
    // that work.
    if (clientRequestId) {
      const { data: existingByRequestId } = await supabase
        .from("matches")
        .select("id")
        .eq("client_request_id", clientRequestId)
        .maybeSingle();

      if (existingByRequestId) {
        return NextResponse.json({ matchId: existingByRequestId.id, deduped: true });
      }
    }

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
        client_request_id: clientRequestId,
      })
      .select("id")
      .single();

    // Postgres unique_violation (23505) on client_request_id -- a genuinely
    // concurrent duplicate request won this insert race by a hair (both
    // passed the fast-path SELECT above before either had committed). The
    // DB constraint is what actually stops the second row; this just looks
    // up whichever request won and returns its id instead of surfacing an
    // error for what the student correctly experiences as a success.
    if (matchError?.code === "23505" && clientRequestId) {
      const { data: winner } = await supabase
        .from("matches")
        .select("id")
        .eq("client_request_id", clientRequestId)
        .maybeSingle();

      if (winner) {
        return NextResponse.json({ matchId: winner.id, deduped: true });
      }
    }

    if (matchError || !matchData) {
      return NextResponse.json(
        { error: "We could not save this session. Try again." },
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
        ...(answer.confidence ? { confidence: answer.confidence } : {}),
      }));

      let { error: answersError } = await supabase
        .from("match_answers")
        .insert(answerRows);

      // match_answers.confidence arrives with 20260918_02. Until it is
      // applied, save the answers without it rather than losing the session.
      if (answersError && body.answers.some((a) => a.confidence)) {
        const retry = await supabase.from("match_answers").insert(
          answerRows.map((row) => {
            const copy: Record<string, unknown> = { ...row };
            delete copy.confidence;
            return copy;
          })
        );
        answersError = retry.error;
      }

      if (answersError) {
        await supabase.from("matches").delete().eq("id", matchData.id);

        console.error("Saving session answers failed:", answersError.message);
        return NextResponse.json(
          { error: "We could not save this session. Try again." },
          { status: 500 }
        );
      }
    }

    // Best-effort: roll this match's answers into each answered topic's
    // spaced-repetition schedule so the SRS cron (app/api/cron/srs-reviews)
    // can later remind the student when it comes due. Never blocks the
    // battle-finish response -- the match itself is already saved above.
    // Recovered questions are filtered against the answers this request
    // actually submitted, and only misses can count. A client claiming a
    // recovery on a question it never answered -- or on one it got right
    // first time -- would be buying extra memory stability for free, so the
    // claim is checked rather than trusted.
    const missedIds = new Set(
      body.answers.filter((a) => !a.isCorrect).map((a) => a.questionId)
    );
    const recoveredQuestionIds = new Set(
      (Array.isArray(body.recoveredQuestionIds) ? body.recoveredQuestionIds : [])
        .filter((id): id is string => typeof id === "string")
        .filter((id) => missedIds.has(id))
    );

    // Filled in by recordTopicEvidence below, and used to decide what
    // this session was worth.
    let topicsImproved = 0;
    let clearedReviews = false;

    const localDay = /^\d{4}-\d{2}-\d{2}$/.test(body.localDate || "")
      ? (body.localDate as string)
      : new Date().toISOString().slice(0, 10);

    const owner = { userId: authenticatedUserId, playerName: body.playerName };

    const perTopic = new Map<string, TopicDelta>();
    const topicByQuestion = new Map<string, string>();
    for (const question of questionRows as Array<{ id: string; topic?: string | null }>) {
      if (question.topic) topicByQuestion.set(question.id, question.topic);
    }
    for (const answer of body.answers) {
      const topic = topicByQuestion.get(answer.questionId);
      if (!topic) continue;
      const bucket = perTopic.get(topic) || { correct: 0, total: 0, recoveries: 0, confidentMisses: 0 };
      bucket.total += 1;
      if (answer.isCorrect) bucket.correct += 1;
      // A recovery does not turn the miss into a hit -- the student still got
      // it wrong first, and mastery should keep saying so. It is recorded
      // alongside as separate evidence that the explanation worked.
      if (!answer.isCorrect && recoveredQuestionIds.has(answer.questionId)) bucket.recoveries += 1;
      if (!answer.isCorrect && answer.confidence === "sure") bucket.confidentMisses += 1;
      perTopic.set(topic, bucket);
    }

    // Both schedules in parallel, each one read and a batch of writes. They
    // are best-effort: the match itself is already saved above.
    const [topicOutcome] = await Promise.allSettled([
      recordTopicEvidence(supabase, {
        owner,
        deckId: body.deckId,
        perTopic,
        session: "new",
      }),
      recordQuestionEvidence(supabase, {
        owner,
        deckId: body.deckId,
        answers: body.answers.map((answer) => ({
          questionId: answer.questionId,
          isCorrect: answer.isCorrect,
          responseTimeMs: answer.responseTimeMs,
          confidence: answer.confidence ?? null,
          recovered: recoveredQuestionIds.has(answer.questionId),
        })),
      }),
    ]);

    if (topicOutcome.status === "fulfilled") {
      topicsImproved = topicOutcome.value.topicsImproved;
      clearedReviews = topicOutcome.value.clearedReviews;
    } else {
      console.error(
        "Recording topic evidence failed:",
        topicOutcome.reason instanceof Error ? topicOutcome.reason.message : topicOutcome.reason
      );
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
          subject: "Your AceDecks crown was taken",
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

    // XP, streak, quests and achievements. Signed-in students only -- there
    // is nowhere to hang a guest's progression, and inventing one would
    // mean showing them a level they lose the moment they close the tab.
    //
    // recordSessionProgress never throws and every award is keyed on this
    // match id, so a retried finish cannot pay out twice.
    let progression = null;
    if (authenticatedUserId) {
      progression = await recordSessionProgress(supabase, {
        userId: authenticatedUserId,
        matchId: matchData.id,
        questionsAnswered: body.answers.length,
        correctAnswers: body.answers.filter((a) => a.isCorrect).length,
        mistakesRecovered: recoveredQuestionIds.size,
        topicsImproved,
        clearedReviews,
        isBattleWin: crownTaken,
        today: localDay,
      });
    }

    // Ranked. Only a battle that actually had an opponent is rated -- a
    // solo study session has nothing to be rated against, and inventing an
    // opponent for it would make the ladder meaningless.
    let rating = null;
    if (authenticatedUserId && body.ratedOpponent) {
      const requested = body.ratedOpponent;
      const opponent: RatedOpponent | null =
        requested.kind === "ghost" && requested.matchId
          ? { kind: "ghost", matchId: requested.matchId }
          : requested.kind === "bot"
            ? { kind: "bot", difficulty: requested.difficulty ?? null }
            : null;

      if (opponent) {
        rating = await recordRatedResult({
          supabase,
          userId: authenticatedUserId,
          matchId: matchData.id,
          subject: deckSubject,
          playerScore: authoritativeScore,
          opponentScore:
            typeof body.opponentScore === "number" && Number.isFinite(body.opponentScore)
              ? Math.max(0, Math.round(body.opponentScore))
              : null,
          opponent,
        });
      }
    }

    return NextResponse.json({
      matchId: matchData.id,
      crownTaken,
      progression,
      rating,
    });
  } catch (error) {
    console.error("Failed to finish battle:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We could not save this session. Try again." }, { status: 500 });
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
