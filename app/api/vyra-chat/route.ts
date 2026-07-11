import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  checkInMemoryRateLimit,
  getClientIpAddress,
  hashIdentifier,
} from "@/lib/server/apiUtils";

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getVyraOfflineFallback(message: string): string {
  const reason = clampText(message, 120);
  return [
    "Quick answer",
    "VYRA could not analyze this right now. Try again, or ask about a specific question.",
    "",
    "Simple explanation",
    `Temporary analysis failure: ${reason}.`,
    "",
    "Example",
    "Ask: 'Why was my selected answer wrong for this question?'",
    "",
    "Next step",
    "Retry now, or share the exact question text and your selected answer.",
  ].join("\n");
}

function buildNoContextReply(): string {
  return "Play a battle first, and I'll analyze your weak topics. You can also ask me about a topic directly.";
}

function ensureStructuredReply(reply: string, action: CoachAction): string {
  const trimmed = reply.trim();
  const isMistake = action === "mistake_mode";

  const requiredMistake = [
    "Your answer",
    "Correct answer",
    "Why yours was wrong",
    "Why the correct answer works",
    "Mistake DNA",
    "Try this",
  ];

  const requiredNormal = [
    "Quick answer",
    "Simple explanation",
    "Example",
    "Next step",
  ];

  const required = isMistake ? requiredMistake : requiredNormal;
  const hasAllHeadings = required.every((heading) =>
    new RegExp(`(^|\\n)${heading}(:|\\n)`, "i").test(trimmed)
  );

  if (hasAllHeadings) {
    return trimmed;
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

function isLikelyStudyRequest(input: string): boolean {
  const clean = input.toLowerCase();
  const studySignals = [
    "question",
    "answer",
    "topic",
    "deck",
    "battle",
    "mistake",
    "quiz",
    "hint",
    "explain",
    "study",
    "practice",
    "rematch",
    "concept",
    "mastery",
    "accuracy",
  ];

  return studySignals.some((signal) => clean.includes(signal));
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
}> {
  const { data: answers, error: answersError } = await supabase
    .from("match_answers")
    .select("question_id, selected_answer, is_correct")
    .eq("match_id", matchId);

  if (answersError || !answers || answers.length === 0) {
    return {
      weakTopicSummary: "No saved weak-topic rows found.",
      missedSummary: "No saved missed-question rows found.",
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

  return { weakTopicSummary, missedSummary };
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
      const limit = checkInMemoryRateLimit({
        key: `vyra-chat-unauth:${ipHash}`,
        limit: VYRA_UNAUTH_LIMIT,
        windowMs: VYRA_UNAUTH_WINDOW_MS,
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

    if (!isLikelyStudyRequest(message) && mode !== "quiz") {
      return NextResponse.json({
        reply:
          "I can help only with studying inside StudyClash. Ask about a deck, missed question, weak topic, hint, quiz, or study plan.\n\nNext step: tell me one topic you want to improve and I will coach you.",
      });
    }

    const contextIsThin =
      weakTopics.length === 0 &&
      missedQuestions.length === 0 &&
      mistakeDna.length === 0 &&
      !body.deckId &&
      !body.currentQuestion?.questionText;

    if (contextIsThin) {
      return NextResponse.json({
        reply: buildNoContextReply(),
      });
    }

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

    if (body.matchId) {
      const saved = await resolveSavedBattleContext(body.matchId);
      savedWeakSummary = saved.weakTopicSummary;
      savedMissedSummary = saved.missedSummary;
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
      "6) If question is unrelated to studying, politely redirect.",
      "Response format rules:",
      "For normal questions use exactly: Quick answer, Simple explanation, Example, Next step.",
      "For missed questions use exactly: Your answer, Correct answer, Why yours was wrong, Why the correct answer works, Mistake DNA, Try this.",
      `Current action: ${action}`,
      `Current mode: ${mode}`,
    ].join("\n");

    const contextPrompt = [
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
      "Student message:",
      message,
    ].join("\n\n");

    const openai = getOpenAIClient();
    if (!openai) {
      const fallbackReply = getVyraOfflineFallback(message);
      return NextResponse.json({ reply: fallbackReply });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: "user", content: contextPrompt },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      const fallbackReply = getVyraOfflineFallback(message);
      return NextResponse.json({ reply: fallbackReply });
    }

    const postProcessedReply = /(study more|review more|keep practicing)/i.test(reply)
      ? `${reply}\n\nNext step\nDo one mini question now: explain why your selected answer was wrong and the correct answer was right.`
      : reply;

    const finalReply = ensureStructuredReply(postProcessedReply, action);

    const sessionId = clampText(
      body.sessionId || `vyra-${body.matchId || body.deckId || "global"}`,
      120
    );

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

    return NextResponse.json({ reply: finalReply });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "VYRA failed to respond.";

    const fallbackReply = getVyraOfflineFallback(message);
    return NextResponse.json({ reply: fallbackReply, error: message }, { status: 200 });
  }
}
