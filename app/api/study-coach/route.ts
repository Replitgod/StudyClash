import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

type CoachAction =
  | "ask"
  | "explain_easier"
  | "hint_mode"
  | "quiz_me"
  | "mistake_mode"
  | "study_plan"
  | "rematch_mode"
  | "explain_text";

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

type StudyCoachPayload = {
  action?: CoachAction;
  mode?: CoachMode;
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
  clashRankTier?: string;
  rivalSummary?: string;
  masteryMapSummary?: string;
  chatHistory?: ChatHistoryMessage[];
};

type MatchAnswerRow = {
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  response_time_ms: number | null;
};

type QuestionRow = {
  id: string;
  question_text: string;
  topic: string;
  difficulty: string;
  correct_answer: string;
  explanation: string;
};

type SavedMistakeDnaRow = {
  question_id: string;
  topic: string;
  selected_answer: string;
  correct_answer: string;
  misunderstood_concept: string | null;
  confidence_rating: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function clampText(value: string, max = 1000): string {
  const clean = (value || "").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`;
}

function buildActionInstruction(action: CoachAction): string {
  if (action === "quiz_me") {
    return "Run a quiz style interaction: ask one question first, wait for the student answer, then coach.";
  }

  if (action === "hint_mode") {
    return "Give only a hint and thought process steps. Do not reveal final answer unless student asks again.";
  }

  if (action === "mistake_mode") {
    return "For one missed question, provide exact wrong-vs-right analysis and a mini follow-up question.";
  }

  if (action === "study_plan") {
    return "Return a short practical study plan with clear next actions and battle rematch guidance.";
  }

  if (action === "rematch_mode") {
    return "Recommend one short weak-topic rematch setup and explain why it is the best next action.";
  }

  if (action === "explain_easier" || action === "explain_text") {
    return "Explain in very simple terms, then add two memory checks based on likely mistakes.";
  }

  return "Give focused study coaching response using current battle context.";
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
    "explain_text",
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
    "math",
    "history",
    "science",
    "english",
  ];

  return studySignals.some((signal) => clean.includes(signal));
}

async function resolveSavedBattleContext(matchId: string): Promise<{
  missedSummary: string;
  weakTopicSummary: string;
  savedMistakeDnaSummary: string;
}> {
  const { data: answers, error: answersError } = await supabase
    .from("match_answers")
    .select("question_id, selected_answer, is_correct, response_time_ms")
    .eq("match_id", matchId);

  if (answersError || !answers || answers.length === 0) {
    return {
      missedSummary: "No saved missed-question rows found.",
      weakTopicSummary: "No saved weak-topic rows found.",
      savedMistakeDnaSummary: "No saved Mistake DNA rows found.",
    };
  }

  const questionIds = Array.from(
    new Set((answers as MatchAnswerRow[]).map((row) => row.question_id))
  );

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_text, topic, difficulty, correct_answer, explanation")
    .in("id", questionIds);

  if (questionsError || !questions) {
    return {
      missedSummary: "Saved answers found, but question metadata could not be loaded.",
      weakTopicSummary: "Saved answers found, but question metadata could not be loaded.",
      savedMistakeDnaSummary: "Saved answers found, but Mistake DNA rows could not be loaded.",
    };
  }

  const { data: savedMistakeDnaRows } = await supabase
    .from("mistake_breakdowns")
    .select("question_id, topic, selected_answer, correct_answer, misunderstood_concept, confidence_rating")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(10);

  const savedMistakeDnaSummary =
    (savedMistakeDnaRows || []).length === 0
      ? "No saved Mistake DNA rows for this match."
      : (savedMistakeDnaRows as SavedMistakeDnaRow[])
          .map(
            (row, index) =>
              `${index + 1}. [${row.topic || "General"}] ${row.selected_answer} -> ${row.correct_answer} | type=${row.confidence_rating || "unknown"} | concept=${row.misunderstood_concept || "n/a"}`
          )
          .join("\n");

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
        explanation: question.explanation,
      };
    })
    .filter((entry) => entry !== null) as Array<{
    topic: string;
    questionText: string;
    selectedAnswer: string;
    correctAnswer: string;
    explanation: string;
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
          .slice(0, 8)
          .map(
            (row, index) =>
              `${index + 1}. [${row.topic}] Q: ${row.questionText} | Selected: ${row.selectedAnswer} | Correct: ${row.correctAnswer}`
          )
          .join("\n");

  return {
    missedSummary,
    weakTopicSummary,
    savedMistakeDnaSummary,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StudyCoachPayload;
    const action = normalizeAction(body.action);
    const mode = normalizeMode(body.mode);
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json(
        { error: "Please enter a message for Nova AI." },
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

    let deckSummary = "Deck metadata unavailable.";
    if (body.deckId) {
      const { data: deck } = await supabase
        .from("decks")
        .select("id, title, course_name, user_id")
        .eq("id", body.deckId)
        .single();

      if (deck) {
        deckSummary = `Deck: ${deck.title} | Course: ${deck.course_name}`;
      }
    }

    let savedMissedSummary = "No saved missed-question context loaded.";
    let savedWeakSummary = "No saved weak-topic context loaded.";
    let savedMistakeDnaSummary = "No saved Mistake DNA context loaded.";

    if (body.matchId) {
      const saved = await resolveSavedBattleContext(body.matchId);
      savedMissedSummary = saved.missedSummary;
      savedWeakSummary = saved.weakTopicSummary;
      savedMistakeDnaSummary = saved.savedMistakeDnaSummary;
    }

    const weakTopics = safeArray<string>(body.weakTopics)
      .map((topic) => String(topic || "").trim())
      .filter(Boolean)
      .slice(0, 12);

    const missedQuestions = safeArray<MissedQuestionInput>(body.missedQuestions)
      .map((question) => ({
        questionText: clampText(String(question.questionText || ""), 220),
        selectedAnswer: clampText(String(question.selectedAnswer || ""), 120),
        correctAnswer: clampText(String(question.correctAnswer || ""), 120),
        topic: clampText(String(question.topic || "General"), 120),
        explanation: clampText(String(question.explanation || ""), 220),
      }))
      .slice(0, 12);

    const mistakeDna = safeArray<MistakeDnaInput>(body.mistakeDna)
      .map((entry) => ({
        questionId: clampText(String(entry.questionId || ""), 80),
        topic: clampText(String(entry.topic || "General"), 120),
        selectedAnswer: clampText(String(entry.selectedAnswer || ""), 120),
        correctAnswer: clampText(String(entry.correctAnswer || ""), 120),
        misunderstoodConcept: clampText(String(entry.misunderstoodConcept || ""), 180),
        mistakeType: clampText(String(entry.mistakeType || ""), 80),
      }))
      .slice(0, 12);

    const masteryProgress = safeArray<MasteryProgressInput>(body.masteryProgress)
      .map((entry) => ({
        label: clampText(String(entry.label || ""), 80),
        value: typeof entry.value === "number" && Number.isFinite(entry.value)
          ? Math.max(0, Math.min(100, Math.round(entry.value)))
          : null,
        details: clampText(String(entry.details || ""), 180),
      }))
      .slice(0, 8);

    const missedQuestionSummary =
      missedQuestions.length === 0
        ? "No client-provided missed questions."
        : missedQuestions
            .map(
              (row, index) =>
                `${index + 1}. [${row.topic}] Q: ${row.questionText} | Selected: ${row.selectedAnswer} | Correct: ${row.correctAnswer}`
            )
            .join("\n");

    const history = safeArray<ChatHistoryMessage>(body.chatHistory)
      .filter((entry) =>
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0
      )
      .slice(-10)
      .map((entry) => ({
        role: entry.role,
        content: clampText(entry.content, 1400),
      }));

    let previousRematches =
      typeof body.previousRematches === "number" && Number.isFinite(body.previousRematches)
        ? Math.max(0, Math.round(body.previousRematches))
        : 0;

    if (body.deckId && body.playerName) {
      const { count } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("deck_id", body.deckId)
        .eq("player_name", body.playerName);

      if (typeof count === "number" && Number.isFinite(count)) {
        // One match is the current attempt; rematches are additional attempts.
        previousRematches = Math.max(previousRematches, Math.max(0, count - 1));
      }
    }

    const battleScore =
      typeof body.battleScore === "number" && Number.isFinite(body.battleScore)
        ? Math.round(body.battleScore)
        : null;
    const accuracyPercent =
      typeof body.accuracyPercent === "number" && Number.isFinite(body.accuracyPercent)
        ? Math.max(0, Math.min(100, Math.round(body.accuracyPercent)))
        : null;

    const weakTopicSummary =
      weakTopics.length > 0 ? weakTopics.join(", ") : "No weak topics from client payload.";

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
        ? "No mastery progress provided."
        : masteryProgress
            .map((entry) => `${entry.label || "Progress"}: ${entry.value ?? "n/a"}% ${entry.details || ""}`.trim())
            .join(" | ");

    const contextIsThin =
      weakTopics.length === 0 &&
      missedQuestions.length === 0 &&
      mistakeDna.length === 0 &&
      !body.deckId;

    const unrelatedRequest = !isLikelyStudyRequest(message) && mode !== "quiz";

    if (unrelatedRequest) {
      return NextResponse.json({
        reply:
          "I can only help with StudyClash learning tasks. Ask me about a deck, missed question, weak topic, hint, quiz, or rematch plan.\n\nWhat to do next: pick one missed question and I will break it down step by step.",
      });
    }

    if (contextIsThin) {
      return NextResponse.json({
        reply:
          "Play a battle first, and I will analyze your weak topics.\n\nWhat to do next: choose a deck and finish one battle, then open Nova AI again.",
      });
    }

    const systemPrompt = [
      "Nova AI is the StudyClash personal study coach. Nova helps students improve through short, clear, specific explanations. Nova uses the student's battle data, missed questions, weak topics, mastery history, rival pressure, and rank context. Nova should sound encouraging but direct. Nova should not give long generic lectures. Nova should always end with one useful next step or one mini practice question.",
      "Never use vague coaching like: 'Study more', 'Review the topic', or 'Try again'.",
      "Keep answers short unless the student asks for detail.",
      "Do not hallucinate deck facts. Only use provided context.",
      "If context is missing, ask the student to choose a deck or question.",
      "Do not answer unrelated questions outside studying.",
      "For math: show steps clearly.",
      "For history, science, and English: explain concepts in simple student-friendly language.",
      "Default response structure:\n- Quick answer\n- Why it matters\n- Simple example\n- What to do next",
      "For missed-question analysis, use:\n- Your answer:\n- Correct answer:\n- Why yours was wrong:\n- Why the correct one works:\n- Mistake type:\n- Try this mini question:",
      "When in hint mode, do not reveal full answers unless the student asks directly.",
      `Current coaching mode: ${mode}`,
      `Current action trigger: ${action}`,
      `Action behavior instruction: ${buildActionInstruction(action)}`,
      "Use prior chat history to avoid repeating the same explanation wording.",
    ].join("\n");

    const contextPrompt = [
      `Student name: ${body.playerName || "Unknown"}`,
      `Deck title: ${body.deckTitle || "Unknown"}`,
      `Course name: ${body.courseName || "Unknown"}`,
      `Deck summary: ${deckSummary}`,
      `Authenticated user: ${authedUserId ? "yes" : "no"}`,
      `Battle score: ${battleScore ?? "unknown"}`,
      `Accuracy percent: ${accuracyPercent ?? "unknown"}`,
      `Previous rematches: ${previousRematches}`,
      `Mastery progress: ${masterySummary}`,
      `ClashRank tier: ${clampText(String(body.clashRankTier || "unknown"), 60)}`,
      `Rival summary: ${clampText(String(body.rivalSummary || "none"), 180)}`,
      `Mastery map summary: ${clampText(String(body.masteryMapSummary || "none"), 180)}`,
      `Weak topics (from payload): ${weakTopicSummary}`,
      `Weak topics (saved): ${savedWeakSummary}`,
      "Mistake DNA (from payload):",
      mistakeDnaSummary,
      "Mistake DNA (saved):",
      savedMistakeDnaSummary,
      "Missed questions (from payload):",
      missedQuestionSummary,
      "Missed questions (saved):",
      savedMissedSummary,
      "Current user request:",
      message,
      "Response format guidance:",
      "- Be specific and battle-focused.",
      "- Keep response compact.",
      "- End with exactly one next step or one mini practice question.",
    ].join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((entry) => ({ role: entry.role, content: entry.content })),
        { role: "user", content: contextPrompt },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      return NextResponse.json(
        { error: "Nova AI could not generate a response." },
        { status: 500 }
      );
    }

    let refinedReply = reply;
    if (/(study more|review the topic|try again)/i.test(refinedReply)) {
      refinedReply = `${refinedReply}\n\nWhat to do next: Solve one weak-topic rematch question and explain your reasoning out loud before selecting an answer.`;
    }

    return NextResponse.json({ reply: refinedReply });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nova AI failed to respond.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
