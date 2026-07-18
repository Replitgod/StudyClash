import OpenAI from "openai";
import { TERRA_TASK } from "@/lib/server/aiModels";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type StageResult = {
  passed: boolean;
  score: number;
  notes: string;
};

export type AiVerificationResult = {
  sourceGrounding: StageResult;
  answerVerification: StageResult;
  curriculumAlignment: StageResult;
  // Difficulty classification re-labels rather than gates -- see
  // questionVerificationJob.ts for why this stage never blocks approval.
  difficultyClassification: StageResult & { suggestedDifficulty: number };
  ambiguityCheck: StageResult;
};

function parseStage(raw: unknown, fallbackNotes: string): StageResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    passed: typeof r.passed === "boolean" ? r.passed : false,
    score: typeof r.score === "number" ? Math.min(1, Math.max(0, r.score)) : 0,
    notes: typeof r.notes === "string" && r.notes.length > 0 ? r.notes : fallbackNotes,
  };
}

// The Section 8 validation chain's four AI-judged stages (source_grounding,
// answer_verification, curriculum_alignment, difficulty_classification,
// ambiguity_check) collapsed into ONE structured call rather than five
// separate API round-trips per question -- same batching tradeoff already
// used in summarization.ts's per-chunk batch call. duplicate_detection
// stays a fully separate, deterministic, non-AI check (see
// find_similar_curriculum_questions in
// 20260729_curriculum_duplicate_detection.sql) and final_approval is a
// pure rollup -- neither needs a model call at all.
export async function verifyQuestionAgainstSource(args: {
  question: {
    questionText: string;
    questionType: string;
    correctAnswer: string;
    acceptedAnswers: string[];
    explanation: string;
    difficulty: number;
    choices: unknown[];
  };
  concept: { name: string; description: string | null };
  excerpts: { pageStart: number; pageEnd: number; text: string }[];
}): Promise<AiVerificationResult> {
  const excerptBlock = args.excerpts
    .map((e, i) => `[Source ${i + 1}] (pages ${e.pageStart}-${e.pageEnd})\n${e.text}`)
    .join("\n\n");

  const prompt = `
You are a strict quality reviewer for an exam-prep question bank. Independently verify the question below against ONLY the source excerpts provided -- do not trust the question author's explanation or answer key at face value; re-derive the answer yourself from the sources.

Concept being tested: ${args.concept.name}
Concept description: ${args.concept.description || "(none)"}

Source excerpts this question claims to be grounded in:
${excerptBlock}

Question under review:
Type: ${args.question.questionType}
Text: ${args.question.questionText}
Choices: ${JSON.stringify(args.question.choices)}
Claimed correct answer: ${args.question.correctAnswer}
Accepted alternate answers: ${JSON.stringify(args.question.acceptedAnswers)}
Explanation given: ${args.question.explanation}
Claimed difficulty (1-5): ${args.question.difficulty}

Evaluate five aspects, each with passed (boolean), score (0-1), and notes (string, brief):

1. sourceGrounding: Is every fact/claim in the question and explanation actually supported by the source excerpts, with no fabricated or outside-knowledge content? Fail if it invents anything not in the excerpts.
2. answerVerification: Re-derive the correct answer yourself from the excerpts. Does it match the claimed correct answer (or an accepted alternate)? Fail if the claimed answer is wrong, or if for a multiple_choice/multi_select question more than one choice is actually defensible as correct.
3. curriculumAlignment: Does this question genuinely test the stated concept (not a tangential or unrelated fact that happens to appear in the same excerpt)?
4. difficultyClassification: Independently estimate the true difficulty (1-5) of this question given what it actually demands of a student. Also return suggestedDifficulty (integer 1-5) as your independent estimate. passed = your estimate is within 1 point of the claimed difficulty.
5. ambiguityCheck: Is the question worded so that a well-prepared student would find exactly ONE defensible correct answer, with no ambiguous phrasing, missing context, or multiple valid interpretations?

Return ONLY valid JSON: {"sourceGrounding": {"passed": bool, "score": number, "notes": string}, "answerVerification": {...}, "curriculumAlignment": {...}, "difficultyClassification": {"passed": bool, "score": number, "notes": string, "suggestedDifficulty": number}, "ambiguityCheck": {...}}
`.trim();

  const completion = await openai.chat.completions.create({
    model: TERRA_TASK.model,
    reasoning_effort: TERRA_TASK.reasoning_effort,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Question verification returned an empty response.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Question verification returned invalid JSON.");
  }

  const difficultyRaw = (parsed.difficultyClassification && typeof parsed.difficultyClassification === "object"
    ? parsed.difficultyClassification
    : {}) as Record<string, unknown>;

  return {
    sourceGrounding: parseStage(parsed.sourceGrounding, "No grounding notes returned."),
    answerVerification: parseStage(parsed.answerVerification, "No answer-verification notes returned."),
    curriculumAlignment: parseStage(parsed.curriculumAlignment, "No alignment notes returned."),
    difficultyClassification: {
      ...parseStage(parsed.difficultyClassification, "No difficulty notes returned."),
      suggestedDifficulty:
        typeof difficultyRaw.suggestedDifficulty === "number"
          ? Math.min(5, Math.max(1, Math.round(difficultyRaw.suggestedDifficulty)))
          : args.question.difficulty,
    },
    ambiguityCheck: parseStage(parsed.ambiguityCheck, "No ambiguity notes returned."),
  };
}
