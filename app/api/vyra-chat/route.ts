import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  getClientIpAddress,
  hashIdentifier,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { TERRA_TASK } from "@/lib/server/aiModels";
import {
  findStudyResources,
  detectExamTrack,
  type ResourceRecommendation,
} from "@/lib/server/resourceSearch";
import {
  VYRA_STREAM_META_DELIMITER,
  VYRA_STREAM_HEADER,
  type VyraStreamMeta,
} from "@/lib/vyraStream";
import { createShortTermStudyPlan } from "@/lib/server/studyPlanCreation";
import { extractPlanMarkers, inferAssessmentType } from "@/lib/server/vyraPlanParsing";

export const runtime = "nodejs";
export const maxDuration = 60;

type CoachAction =
  | "ask"
  | "explain_easier"
  | "hint_mode"
  | "quiz_me"
  | "mistake_mode"
  | "study_plan"
  | "rematch_mode"
  | "next_topic";

type CoachMode =
  | "explain"
  | "hint"
  | "quiz"
  | "mistake"
  | "plan"
  | "rematch";

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type MissedQuestionInput = {
  questionText: string;
  selectedAnswer: string;
  correctAnswer: string;
  topic: string;
  explanation: string;
};

type MistakeDnaInput = {
  questionId?: string;
  topic: string;
  selectedAnswer: string;
  correctAnswer: string;
  misunderstoodConcept?: string;
  mistakeType?: string;
};

type MasteryProgressInput = {
  label?: string;
  value?: number;
  details?: string;
};

type CurrentQuestionInput = {
  questionText?: string;
  selectedAnswer?: string;
  correctAnswer?: string;
  explanation?: string;
};

type BattleHistoryInput = {
  score?: number;
  accuracyPercent?: number;
  deckTitle?: string;
  createdAt?: string;
};

type VyraChatPayload = {
  action?: CoachAction;
  mode?: CoachMode;
  sessionId?: string;
  message?: string;
  deckId?: string;
  matchId?: string;
  deckTitle?: string;
  courseName?: string;
  playerName?: string;
  weakTopics?: string[];
  missedQuestions?: MissedQuestionInput[];
  mistakeDna?: MistakeDnaInput[];
  battleScore?: number;
  accuracyPercent?: number;
  previousRematches?: number;
  masteryProgress?: MasteryProgressInput[];
  currentQuestion?: CurrentQuestionInput;
  recentBattleHistory?: BattleHistoryInput[];
  chatHistory?: ChatHistoryMessage[];
};

type MatchAnswerRow = {
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
};

type QuestionRow = {
  id: string;
  question_text: string;
  topic: string;
  correct_answer: string;
  explanation: string;
};

const FREE_PLAN_IDS = new Set(["free_beta"]);
const FREE_DAILY_VYRA_CAP = 80;
const DEFAULT_DAILY_VYRA_CAP = 180;
const VYRA_UNAUTH_WINDOW_MS = 60_000;
const VYRA_UNAUTH_LIMIT = 12;
// Anonymous callers have no per-day cap otherwise (only the per-minute burst
// limit above), so a slow/distributed anonymous client could otherwise call
// this OpenAI-backed endpoint indefinitely. Mirrors the authenticated free
// plan's daily ceiling, keyed by IP instead of user id.
const VYRA_UNAUTH_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const VYRA_UNAUTH_DAILY_LIMIT = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Never interpolate the raw caught error into this -- it's shown to the
// student verbatim as VYRA's reply, so it must never carry provider/internal
// error text through.
function getVyraOfflineFallback(): string {
  return [
    "Quick answer",
    "VYRA could not analyze this right now. Try again, or ask about a specific question.",
    "",
    "Simple explanation",
    "Temporary analysis failure -- this usually clears up on retry.",
    "",
    "Example",
    "Ask: 'Why was my selected answer wrong for this question?'",
    "",
    "Next step",
    "Retry now, or share the exact question text and your selected answer.",
  ].join("\n");
}

// Freeform chat has no dedicated "find resources" action (that's a separate
// button/endpoint -- see find-resources/route.ts), so a student typing
// something like "can I get Deens Academy study source" or "any LSAT/MCAT
// resources" only reaches VYRA as a normal "ask" message. Detect that intent
// here and run a real grounded search alongside the reply so VYRA can answer
// with actual links instead of declining (rule 7 below forbids it from
// inventing sources on its own).
const RESOURCE_INTENT_RE =
  /\b(resources?|sources?|links?|websites?|study\s*guides?|study\s*materials?|prep\s*books?|past\s*papers?|practice\s*(tests?|questions?|exams?)|notes|pdf|video\s*course|where\s+(can|do)\s+i\s+(find|get)|recommend\b|any\s+good\b)\b/i;

function wantsStudyResources(text: string): boolean {
  return RESOURCE_INTENT_RE.test(text);
}

function stripMarkdownArtifacts(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*-](\s+)/gm, "$1-$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function ensureStructuredReply(reply: string, action: CoachAction): string {
  const trimmed = reply.trim();
  const isMistake = action === "mistake_mode";
  // A genuine study-plan reply (rule 8) never contains "Quick answer" as a
  // heading -- without this branch, every real day-by-day plan failed the
  // requiredNormal check below and got silently replaced by the generic
  // fallback, discarding the plan the model just computed.
  const isPlan = action === "study_plan";

  const requiredMistake = [
    "Your answer",
    "Correct answer",
    "Why yours was wrong",
    "Why the correct answer works",
    "Mistake DNA",
    "Try this",
  ];

  const requiredPlan = [
    "Exam & date",
    "Priority topics",
    "Day-by-day plan",
    "Recommended next battle",
  ];

  const requiredNormal = [
    "Quick answer",
    "Simple explanation",
    "Example",
    "Next step",
  ];

  const required = isMistake ? requiredMistake : isPlan ? requiredPlan : requiredNormal;
  const hasAllHeadings = required.every((heading) =>
    new RegExp(`(^|\\n)${heading}(:|\\n)`, "i").test(trimmed)
  );

  if (hasAllHeadings) {
    return trimmed;
  }

  if (isPlan) {
    // The model didn't follow the plan format (likely because it was asking
    // a clarifying question, e.g. missing a date) -- surface what it
    // actually said instead of forcing an unrelated canned plan onto it.
    return trimmed || "Tell me the subject and date of your upcoming exam and I'll build a day-by-day plan.";
  }

  if (isMistake) {
    return [
      "Your answer",
      "Not clearly captured in this response.",
      "",
      "Correct answer",
      "Not clearly captured in this response.",
      "",
      "Why yours was wrong",
      clampText(trimmed, 240),
      "",
      "Why the correct answer works",
      "It matches the specific condition the question is testing.",
      "",
      "Mistake DNA",
      "concept_gap",
      "",
      "Try this",
      "Write one sentence comparing your selected answer vs the correct answer using the key concept.",
    ].join("\n");
  }

  return [
    "Quick answer",
    clampText(trimmed, 220),
    "",
    "Simple explanation",
    "Focus on the key concept and remove options that are only partially true.",
    "",
    "Example",
    "Use one missed question and explain why the correct option fits the prompt exactly.",
    "",
    "Next step",
    "Ask me to quiz you on one weak topic right now.",
  ].join("\n");
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function clampText(value: string, max = 1000): string {
  const clean = (value || "").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`;
}

function normalizeAction(value: unknown): CoachAction {
  const allowed: CoachAction[] = [
    "ask",
    "explain_easier",
    "hint_mode",
    "quiz_me",
    "mistake_mode",
    "study_plan",
    "rematch_mode",
    "next_topic",
  ];

  const raw = typeof value === "string" ? value : "ask";
  return allowed.includes(raw as CoachAction) ? (raw as CoachAction) : "ask";
}

function normalizeMode(value: unknown): CoachMode {
  const allowed: CoachMode[] = [
    "explain",
    "hint",
    "quiz",
    "mistake",
    "plan",
    "rematch",
  ];

  const raw = typeof value === "string" ? value : "explain";
  return allowed.includes(raw as CoachMode) ? (raw as CoachMode) : "explain";
}

function firstMissedQuestion(
  currentQuestion: CurrentQuestionInput | undefined,
  missedQuestions: MissedQuestionInput[]
): MissedQuestionInput | null {
  if (
    currentQuestion?.questionText &&
    currentQuestion.selectedAnswer &&
    currentQuestion.correctAnswer &&
    currentQuestion.selectedAnswer !== currentQuestion.correctAnswer
  ) {
    return {
      questionText: currentQuestion.questionText,
      selectedAnswer: currentQuestion.selectedAnswer,
      correctAnswer: currentQuestion.correctAnswer,
      topic: "Current Question",
      explanation: currentQuestion.explanation || "",
    };
  }

  return missedQuestions.length > 0 ? missedQuestions[0] : null;
}

function buildNoAiMissedQuestionReply(args: {
  missed: MissedQuestionInput;
  dna: MistakeDnaInput | null;
}): string {
  const { missed, dna } = args;
  return [
    "Your answer:",
    `${missed.selectedAnswer || "Not provided"}`,
    "",
    "Correct answer:",
    `${missed.correctAnswer || "Not provided"}`,
    "",
    "Why yours was wrong:",
    `It does not match the key condition in this question about ${missed.topic || "this topic"}.`,
    "",
    "Why the correct answer works:",
    missed.explanation || `It directly matches the concept being tested in ${missed.topic || "this topic"}.`,
    "",
    "Mistake DNA:",
    dna?.mistakeType || "concept_gap",
    "",
    "Try this:",
    `Mini practice: In one sentence, explain why "${missed.correctAnswer}" is stronger than "${missed.selectedAnswer}" for this topic.`,
  ].join("\n");
}

function buildNoAiHintReply(missed: MissedQuestionInput): string {
  return [
    "Quick answer",
    `Start with the clue in the question that points to ${missed.topic || "the concept"}.`,
    "",
    "Simple explanation",
    "Eliminate choices that are true in general but do not match the exact condition in the prompt.",
    "",
    "Example",
    `If two options look close, prefer the one that directly supports "${missed.correctAnswer}" logic, not the one that only sounds familiar.`,
    "",
    "Next step",
    "Tell me your reasoning in one sentence and I will check it before revealing the full answer.",
  ].join("\n");
}

async function resolveSavedBattleContext(matchId: string): Promise<{
  weakTopicSummary: string;
  missedSummary: string;
  weakTopicNames: string[];
}> {
  const { data: answers, error: answersError } = await supabase
    .from("match_answers")
    .select("question_id, selected_answer, is_correct")
    .eq("match_id", matchId);

  if (answersError || !answers || answers.length === 0) {
    return {
      weakTopicSummary: "No saved weak-topic rows found.",
      missedSummary: "No saved missed-question rows found.",
      weakTopicNames: [],
    };
  }

  const questionIds = Array.from(
    new Set((answers as MatchAnswerRow[]).map((row) => row.question_id))
  );

  const { data: questions } = await supabase
    .from("questions")
    .select("id, question_text, topic, correct_answer, explanation")
    .in("id", questionIds);

  if (!questions) {
    return {
      weakTopicSummary: "Saved answer rows found, but question details were unavailable.",
      missedSummary: "Saved answer rows found, but question details were unavailable.",
      weakTopicNames: [],
    };
  }

  const questionById = new Map(
    (questions as QuestionRow[]).map((question) => [question.id, question])
  );

  const missed = (answers as MatchAnswerRow[])
    .filter((answer) => !answer.is_correct)
    .map((answer) => {
      const question = questionById.get(answer.question_id);
      if (!question) return null;
      return {
        topic: question.topic || "General",
        questionText: question.question_text,
        selectedAnswer: answer.selected_answer,
        correctAnswer: question.correct_answer,
      };
    })
    .filter((entry) => entry !== null) as Array<{
    topic: string;
    questionText: string;
    selectedAnswer: string;
    correctAnswer: string;
  }>;

  const byTopic = new Map<string, number>();
  for (const row of missed) {
    byTopic.set(row.topic, (byTopic.get(row.topic) || 0) + 1);
  }

  const weakTopicSummary =
    byTopic.size === 0
      ? "No weak topics in this match."
      : Array.from(byTopic.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([topic, count]) => `${topic}: ${count} miss(es)`)
          .join(" | ");

  const missedSummary =
    missed.length === 0
      ? "No missed questions in this match."
      : missed
          .slice(0, 6)
          .map(
            (row, index) =>
              `${index + 1}. [${row.topic}] Q: ${row.questionText} | Selected: ${row.selectedAnswer} | Correct: ${row.correctAnswer}`
          )
          .join("\n");

  const weakTopicNames = Array.from(byTopic.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, 5);

  return { weakTopicSummary, missedSummary, weakTopicNames };
}

async function enforceVyraUsageLimit(userId: string): Promise<{
  allowed: boolean;
  status?: number;
  error?: string;
  planId?: string;
}> {
  const { data: profileData } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  const activePlanId = String(profileData?.plan || "free_beta");

  const { data: planData } = await supabase
    .from("membership_plans")
    .select("daily_limit")
    .eq("id", activePlanId)
    .single();

  const dailyPlanLimit =
    planData && typeof planData.daily_limit === "number"
      ? Math.max(1, Math.round(planData.daily_limit))
      : null;

  const planCap = FREE_PLAN_IDS.has(activePlanId)
    ? FREE_DAILY_VYRA_CAP
    : dailyPlanLimit ?? DEFAULT_DAILY_VYRA_CAP;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("generation_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source_kind", "vyra_chat")
    .gte("created_at", startOfToday.toISOString());

  if (error) {
    return {
      allowed: false,
      status: 500,
      error: "Could not check your VYRA usage right now. Please try again.",
      planId: activePlanId,
    };
  }

  if ((count || 0) >= planCap) {
    return {
      allowed: false,
      status: 429,
      error:
        "Daily VYRA chat limit reached for your current plan. Continue tomorrow or upgrade for higher limits.",
      planId: activePlanId,
    };
  }

  return { allowed: true, planId: activePlanId };
}

async function logVyraUsage(args: {
  userId: string;
  deckId?: string;
  planId?: string;
}) {
  const { userId, deckId, planId } = args;

  let { error } = await supabase.from("generation_logs").insert({
    user_id: userId,
    deck_id: deckId || null,
    source_kind: "vyra_chat",
    is_priority: false,
    plan_id_snapshot: planId || "free_beta",
  });

  if (error) {
    const fallback = await supabase.from("generation_logs").insert({
      user_id: userId,
      deck_id: deckId || null,
    });
    error = fallback.error;
  }

  if (error) {
    console.error("Failed to insert VYRA usage log:", error.message);
  }
}

async function saveChatIfTableExists(args: {
  sessionId: string;
  userId: string | null;
  deckId?: string;
  matchId?: string;
  userMessage: string;
  assistantReply: string;
}) {
  const { sessionId, userId, deckId, matchId, userMessage, assistantReply } = args;

  const sessionInsert = await supabase.from("vyra_chat_sessions").upsert(
    {
      id: sessionId,
      user_id: userId,
      deck_id: deckId || null,
      match_id: matchId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (sessionInsert.error) {
    return;
  }

  await supabase.from("vyra_chat_messages").insert([
    {
      session_id: sessionId,
      role: "user",
      content: userMessage,
    },
    {
      session_id: sessionId,
      role: "assistant",
      content: assistantReply,
    },
  ]);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as VyraChatPayload;
    const action = normalizeAction(body.action);
    const mode = normalizeMode(body.mode);
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json(
        { error: "Please enter a message for VYRA." },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    let authedUserId: string | null = null;
    if (accessToken) {
      const {
        data: { user },
      } = await supabase.auth.getUser(accessToken);
      authedUserId = user?.id || null;
    }

    if (!authedUserId) {
      const ipHash = hashIdentifier(getClientIpAddress(req));
      const limit = await checkDistributedRateLimit({
        key: `vyra-chat-unauth:${ipHash}`,
        limit: VYRA_UNAUTH_LIMIT,
        windowSeconds: VYRA_UNAUTH_WINDOW_MS / 1000,
      });

      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Too many VYRA requests. Please wait and try again." },
          {
            status: 429,
            headers: { "Retry-After": String(limit.retryAfterSeconds) },
          }
        );
      }

      const dailyLimit = await checkDistributedRateLimit({
        key: `vyra-chat-unauth-daily:${ipHash}`,
        limit: VYRA_UNAUTH_DAILY_LIMIT,
        windowSeconds: VYRA_UNAUTH_DAILY_WINDOW_MS / 1000,
      });

      if (!dailyLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "Daily VYRA limit reached for guest usage. Sign in for a higher daily limit.",
          },
          {
            status: 429,
            headers: { "Retry-After": String(dailyLimit.retryAfterSeconds) },
          }
        );
      }
    }

    if (authedUserId) {
      const usage = await enforceVyraUsageLimit(authedUserId);
      if (!usage.allowed) {
        return NextResponse.json(
          { error: usage.error || "VYRA usage unavailable right now." },
          { status: usage.status || 429 }
        );
      }
    }

    const weakTopics = safeArray<string>(body.weakTopics)
      .map((topic) => clampText(String(topic || ""), 120))
      .filter(Boolean)
      .slice(0, 10);

    const missedQuestions = safeArray<MissedQuestionInput>(body.missedQuestions)
      .map((q) => ({
        questionText: clampText(String(q.questionText || ""), 260),
        selectedAnswer: clampText(String(q.selectedAnswer || ""), 140),
        correctAnswer: clampText(String(q.correctAnswer || ""), 140),
        topic: clampText(String(q.topic || "General"), 120),
        explanation: clampText(String(q.explanation || ""), 360),
      }))
      .slice(0, 10);

    const mistakeDna = safeArray<MistakeDnaInput>(body.mistakeDna)
      .map((entry) => ({
        questionId: clampText(String(entry.questionId || ""), 80),
        topic: clampText(String(entry.topic || "General"), 120),
        selectedAnswer: clampText(String(entry.selectedAnswer || ""), 120),
        correctAnswer: clampText(String(entry.correctAnswer || ""), 120),
        misunderstoodConcept: clampText(String(entry.misunderstoodConcept || ""), 180),
        mistakeType: clampText(String(entry.mistakeType || ""), 80),
      }))
      .slice(0, 10);

    const masteryProgress = safeArray<MasteryProgressInput>(body.masteryProgress)
      .map((entry) => ({
        label: clampText(String(entry.label || ""), 80),
        value:
          typeof entry.value === "number" && Number.isFinite(entry.value)
            ? Math.max(0, Math.min(100, Math.round(entry.value)))
            : null,
        details: clampText(String(entry.details || ""), 140),
      }))
      .slice(0, 8);

    const recentBattleHistory = safeArray<BattleHistoryInput>(body.recentBattleHistory)
      .map((entry) => ({
        score:
          typeof entry.score === "number" && Number.isFinite(entry.score)
            ? Math.round(entry.score)
            : null,
        accuracyPercent:
          typeof entry.accuracyPercent === "number" && Number.isFinite(entry.accuracyPercent)
            ? Math.max(0, Math.min(100, Math.round(entry.accuracyPercent)))
            : null,
        deckTitle: clampText(String(entry.deckTitle || ""), 100),
      }))
      .slice(0, 6);

    const history = safeArray<ChatHistoryMessage>(body.chatHistory)
      .filter(
        (entry) =>
          (entry.role === "user" || entry.role === "assistant") &&
          typeof entry.content === "string" &&
          entry.content.trim().length > 0
      )
      .slice(-12)
      .map((entry) => ({
        role: entry.role,
        content: clampText(entry.content, 1400),
      }));

    const missed = firstMissedQuestion(body.currentQuestion, missedQuestions);
    const firstDna = mistakeDna[0] || null;

    if (action === "mistake_mode" && missed) {
      const localReply = buildNoAiMissedQuestionReply({ missed, dna: firstDna });
      await saveChatIfTableExists({
        sessionId: clampText(body.sessionId || `vyra-${body.matchId || body.deckId || "global"}`, 120),
        userId: authedUserId,
        deckId: body.deckId,
        matchId: body.matchId,
        userMessage: message,
        assistantReply: localReply,
      });

      if (authedUserId) {
        const plan = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", authedUserId)
          .single();
        await logVyraUsage({
          userId: authedUserId,
          deckId: body.deckId,
          planId: String(plan.data?.plan || "free_beta"),
        });
      }

      return NextResponse.json({ reply: localReply });
    }

    if (action === "hint_mode" && missed) {
      const localReply = buildNoAiHintReply(missed);
      await saveChatIfTableExists({
        sessionId: clampText(body.sessionId || `vyra-${body.matchId || body.deckId || "global"}`, 120),
        userId: authedUserId,
        deckId: body.deckId,
        matchId: body.matchId,
        userMessage: message,
        assistantReply: localReply,
      });

      if (authedUserId) {
        const plan = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", authedUserId)
          .single();
        await logVyraUsage({
          userId: authedUserId,
          deckId: body.deckId,
          planId: String(plan.data?.plan || "free_beta"),
        });
      }

      return NextResponse.json({ reply: localReply });
    }

    let savedWeakSummary = "No saved weak-topic context loaded.";
    let savedMissedSummary = "No saved missed-question context loaded.";
    let savedWeakTopicNames: string[] = [];

    if (body.matchId) {
      const saved = await resolveSavedBattleContext(body.matchId);
      savedWeakSummary = saved.weakTopicSummary;
      savedMissedSummary = saved.missedSummary;
      savedWeakTopicNames = saved.weakTopicNames;
    }

    const weakTopicSummary =
      weakTopics.length > 0 ? weakTopics.join(", ") : "No weak topics from client payload.";

    const missedQuestionSummary =
      missedQuestions.length === 0
        ? "No client-provided missed questions."
        : missedQuestions
            .map(
              (row, index) =>
                `${index + 1}. [${row.topic}] Q: ${row.questionText} | Selected: ${row.selectedAnswer} | Correct: ${row.correctAnswer}`
            )
            .join("\n");

    const mistakeDnaSummary =
      mistakeDna.length === 0
        ? "No client-provided Mistake DNA."
        : mistakeDna
            .map(
              (entry, index) =>
                `${index + 1}. [${entry.topic}] ${entry.selectedAnswer} -> ${entry.correctAnswer} | type=${entry.mistakeType || "unknown"} | concept=${entry.misunderstoodConcept || "n/a"}`
            )
            .join("\n");

    const masterySummary =
      masteryProgress.length === 0
        ? "No mastery map summary provided."
        : masteryProgress
            .map((entry) => `${entry.label || "Topic"}: ${entry.value ?? "n/a"}% (${entry.details || ""})`)
            .join(" | ");

    const battleHistorySummary =
      recentBattleHistory.length === 0
        ? "No recent battle history provided."
        : recentBattleHistory
            .map(
              (entry, index) =>
                `${index + 1}. ${entry.deckTitle || "Deck"} | score=${entry.score ?? "n/a"} | accuracy=${entry.accuracyPercent ?? "n/a"}%`
            )
            .join("\n");

    const systemPrompt = [
      "You are VYRA, the AI battle coach inside StudyClash. Your job is to help students understand mistakes, master weak topics, and improve through short, clear, personalized coaching. Use the student's StudyClash data whenever available, including deck content, missed questions, weak topics, Mistake DNA, mastery map, and battle history. Do not give generic advice. Be encouraging, direct, and specific. When helpful, give one mini practice question or one next best action.",
      "Behavior rules:",
      "1) Keep responses clear, specific, and not too long.",
      "2) Never say generic lines like 'study more'.",
      "3) If student got something wrong, explain: what they picked, why wrong, why right answer works, mistake type, and one mini practice question.",
      "4) If student asks for help before answering, provide hints first.",
      "5) If context is missing, ask student to choose deck, question, or topic.",
      "6) Study-resource requests are always in scope, for any subject, exam, institution, or coaching program -- AP exams, LSAT, MCAT, NCLEX, IB, SAT/ACT, a specific school or coaching brand like Deens Academy, or anything else a student names. Never refuse or redirect these; only redirect messages that are entirely unrelated to studying.",
      "7) Accuracy is critical: ground every explanation in the provided deck/question context first. If a question reaches beyond that context and you are not fully confident in a fact, formula, date, or figure, say so plainly instead of guessing -- a confident wrong answer actively misleads a student studying for a real exam. Never invent citations, statistics, or sources yourself.",
      "8) If the student states an upcoming exam in one natural sentence (subject, and/or a date like 'next Friday' or 'in 2 weeks', and/or a topic), switch to the study-plan format below. Compute the exact calendar date and days-remaining yourself using 'Today's date' given in the context below -- never guess a relative date. If the student gave a topic, focus the plan on it and closely related weak topics from their StudyClash data; if they gave no topic, prioritize their actual weak topics. If they gave no date, ask for one before planning day-by-day.",
      "9) Plain text only -- the chat UI does not render markdown. Never use **bold**, *italics*, # headers, backtick code, or bullet characters like * or -. Write the required section headings below as plain words alone on their own line, with no symbols around them. For lists, write 'First, ...', 'Second, ...' or separate lines with plain sentences instead of bullet markers.",
      "10) If the context below includes a 'Live resource search' note, a real-time grounded search is running in parallel and any trustworthy results will be shown to the student as clickable cards right after your reply. Do not list, invent, or guess any specific URLs, site names, or sources yourself in this case -- keep your reply focused on coaching (what to look for, how to use the resources once found) and let the cards carry the actual links.",
      "11) When you produce a study-plan reply under rule 8 AND the context below shows a known Match ID (not 'unknown'), a real study plan can actually be created for the student automatically -- append exactly two extra lines after your normal reply, each on its own line, with no other text on those lines: 'PLAN_DUE_DATE: YYYY-MM-DD' using the exact calendar date you computed, and 'PLAN_ASSESSMENT_NAME: ' followed by a short 2-5 word name for the assessment (e.g. 'PLAN_ASSESSMENT_NAME: AP Bio Unit 4 Exam'). Omit both lines entirely if Match ID is unknown, or if you are only asking a clarifying question rather than giving the actual day-by-day plan.",
      "Response format rules:",
      "For normal questions use exactly: Quick answer, Simple explanation, Example, Next step.",
      "For missed questions use exactly: Your answer, Correct answer, Why yours was wrong, Why the correct answer works, Mistake DNA, Try this.",
      "For a stated upcoming exam use exactly: Exam & date (state the exact computed calendar date and days remaining), Priority topics (ranked, tied to their actual weak topics when known), Day-by-day plan (one line per remaining day or, if more than 7 days remain, per remaining 2-3 day block -- keep each day's task short and specific), Recommended next battle (name the specific weak-topic rematch or boss battle they should run today).",
      `Current action: ${action}`,
      `Current mode: ${mode}`,
    ].join("\n");

    const resourceIntent = action === "ask" && wantsStudyResources(message);
    const resourceSearchPromise = resourceIntent
      ? findStudyResources(
          {
            topic: clampText(message, 200),
            courseName: body.courseName || undefined,
            examTrack: detectExamTrack(message),
            weakTopics,
          },
          supabase
        )
      : null;

    const contextPrompt = [
      `Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
      `Student: ${body.playerName || "Student"}`,
      `Deck title: ${body.deckTitle || "Unknown"}`,
      `Course: ${body.courseName || "Unknown"}`,
      `Deck ID: ${body.deckId || "unknown"}`,
      `Match ID: ${body.matchId || "unknown"}`,
      `Battle score: ${typeof body.battleScore === "number" ? Math.round(body.battleScore) : "unknown"}`,
      `Accuracy: ${typeof body.accuracyPercent === "number" ? Math.round(body.accuracyPercent) : "unknown"}%`,
      `Previous rematches: ${typeof body.previousRematches === "number" ? Math.max(0, Math.round(body.previousRematches)) : 0}`,
      `Weak topics (payload): ${weakTopicSummary}`,
      `Weak topics (saved): ${savedWeakSummary}`,
      "Mistake DNA:",
      mistakeDnaSummary,
      "Missed questions (payload):",
      missedQuestionSummary,
      "Missed questions (saved):",
      savedMissedSummary,
      `Current question: ${clampText(String(body.currentQuestion?.questionText || "none"), 320)}`,
      `Current selected answer: ${clampText(String(body.currentQuestion?.selectedAnswer || "none"), 120)}`,
      `Current correct answer: ${clampText(String(body.currentQuestion?.correctAnswer || "none"), 120)}`,
      `Current explanation: ${clampText(String(body.currentQuestion?.explanation || "none"), 320)}`,
      `Mastery map: ${masterySummary}`,
      "Recent battle history:",
      battleHistorySummary,
      ...(resourceIntent
        ? [
            "Live resource search: A real-time grounded search for external study resources on this request is running in parallel (see rule 10).",
          ]
        : []),
      "Student message:",
      message,
    ].join("\n\n");

    const openai = getOpenAIClient();
    if (!openai) {
      const fallbackReply = getVyraOfflineFallback();
      return NextResponse.json({ reply: fallbackReply });
    }

    // Streamed so the student sees VYRA's reply appear token-by-token
    // instead of waiting out the full ~2400-token generation in silence.
    // 300 was sized for gpt-4o-mini, where every token was visible output.
    // TERRA's reasoning tokens count against this same budget, so 300 was
    // getting eaten by hidden reasoning before the model wrote a single
    // reply character -- reply came back empty and every chat message
    // silently fell back to the canned offline response below.
    const completionStream = await openai.chat.completions.create({
      model: TERRA_TASK.model,
      reasoning_effort: TERRA_TASK.reasoning_effort,
      max_completion_tokens: 2400,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: "user", content: contextPrompt },
      ],
    });

    const sessionId = clampText(
      body.sessionId || `vyra-${body.matchId || body.deckId || "global"}`,
      120
    );

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let rawReply = "";

        try {
          for await (const chunk of completionStream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              rawReply += delta;
              controller.enqueue(encoder.encode(delta));
            }
          }

          const resourceOutcome = await (resourceSearchPromise ?? Promise.resolve(null));
          let resources: ResourceRecommendation[] | undefined;
          let resourcesDisclaimer: string | undefined;
          if (resourceOutcome) {
            if (resourceOutcome.ok) {
              resources = resourceOutcome.resources.length > 0 ? resourceOutcome.resources : undefined;
              resourcesDisclaimer = resourceOutcome.disclaimer;
            } else {
              resourcesDisclaimer =
                "VYRA could not run a live resource search right now. Try the Find Study Resources button, or ask again shortly.";
            }
          }

          const trimmedReply = rawReply.trim();
          let finalReply: string;

          if (!trimmedReply) {
            finalReply = getVyraOfflineFallback();
            controller.enqueue(encoder.encode(finalReply));
          } else {
            const cleanedReply = stripMarkdownArtifacts(trimmedReply);
            const postProcessedReply = /(study more|review more|keep practicing)/i.test(cleanedReply)
              ? `${cleanedReply}\n\nNext step\nDo one mini question now: explain why your selected answer was wrong and the correct answer was right.`
              : cleanedReply;
            finalReply = ensureStructuredReply(postProcessedReply, action);
          }

          // Tool actions: turn what VYRA just decided into something the
          // student can actually click, instead of leaving it as advice
          // that evaporates once the chat scrolls past it.
          let battleAction: VyraStreamMeta["battleAction"];
          let studyPlanAction: VyraStreamMeta["studyPlanAction"];

          if (action === "rematch_mode" && body.deckId) {
            const topics = weakTopics.length > 0 ? weakTopics : savedWeakTopicNames;
            battleAction = { deckId: body.deckId, topics };
          }

          if (action === "study_plan") {
            const { cleanedText, dueDate, assessmentName } = extractPlanMarkers(finalReply);
            finalReply = cleanedText;

            if (dueDate && authedUserId && body.matchId) {
              const planResult = await createShortTermStudyPlan({
                supabase,
                userId: authedUserId,
                matchId: body.matchId,
                assessmentType: inferAssessmentType(message),
                assessmentName: assessmentName || undefined,
                dueDate,
              });

              if (planResult.ok) {
                studyPlanAction = {
                  planId: planResult.planId,
                  assessmentName: assessmentName || "Upcoming exam",
                  dueDate,
                };
              }
              // A failed plan (e.g. no topic data yet for this deck) is not
              // an error worth surfacing -- the coaching text still stands
              // on its own, it just won't have a clickable plan attached.
            }
          }

          await saveChatIfTableExists({
            sessionId,
            userId: authedUserId,
            deckId: body.deckId,
            matchId: body.matchId,
            userMessage: message,
            assistantReply: finalReply,
          });

          if (authedUserId) {
            const plan = await supabase
              .from("profiles")
              .select("plan")
              .eq("id", authedUserId)
              .single();

            await logVyraUsage({
              userId: authedUserId,
              deckId: body.deckId,
              planId: String(plan.data?.plan || "free_beta"),
            });
          }

          const meta: VyraStreamMeta = {
            finalReply,
            resources,
            resourcesDisclaimer,
            battleAction,
            studyPlanAction,
          };
          controller.enqueue(encoder.encode(VYRA_STREAM_META_DELIMITER + JSON.stringify(meta)));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        [VYRA_STREAM_HEADER]: "1",
      },
    });
  } catch (error) {
    console.error("VYRA chat failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ reply: getVyraOfflineFallback() }, { status: 200 });
  }
}
