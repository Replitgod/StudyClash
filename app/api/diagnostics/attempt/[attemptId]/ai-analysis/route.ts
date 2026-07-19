import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { TERRA_TASK } from "@/lib/server/aiModels";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Bounds the prompt to the most useful evidence rather than every missed
// question on a 108-question full diagnostic -- the model doesn't need
// every miss to explain the PATTERN behind them.
const MAX_MISSED_QUESTIONS_IN_PROMPT = 15;

export type AiAnalysis = {
  summary: string;
  whyStruggled: string;
  downstreamConcepts: string;
  learnFirst: string[];
  canSkipForNow: string[];
  estimatedStudyHours: number;
  priorityOrder: string[];
  // Real edges from diagnostic_skill_relationships for this student's weak
  // skills, not LLM-invented -- empty when no authored relationship exists
  // for any of them (most of the taxonomy doesn't have edges yet; see the
  // seed migration's own coverage). The LLM is grounded in this list when
  // writing downstreamConcepts, not asked to guess the graph itself.
  groundedPrerequisites: {
    skill: string;
    relatedSkill: string;
    relationshipType: string;
    confidence: number;
    notes: string | null;
  }[];
};

type MissedQuestionRow = {
  question_text: string;
  selected_answer: string | null;
  question: { domain: string; skill: string; difficulty: string; correct_answer: string; explanation: string } | null;
};

// "Do not simply list percentages. Produce a personalized explanation."
// Generated once per attempt (an OpenAI call), then cached on
// diagnostic_results.ai_analysis -- revisiting results never re-generates
// it, same "compute once, cache in the row" pattern already used for the
// estimated score range.
export async function GET(request: NextRequest, { params }: { params: Promise<{ attemptId: string }> }) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const { attemptId } = await params;
  const supabase = getServiceSupabaseClient();

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id, status, mode, exam_id")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt || attempt.user_id !== userId) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status !== "completed") {
    return NextResponse.json({ error: "This diagnostic is not finished yet." }, { status: 409 });
  }

  const { data: results, error: resultsError } = await supabase
    .from("diagnostic_results")
    .select(
      "overall_accuracy, skill_results, difficulty_results, strongest_skills, weakest_skills, common_mistakes, pacing_results, readiness_score, readiness_tier, ai_analysis"
    )
    .eq("attempt_id", attemptId)
    .single();

  if (resultsError || !results) {
    return NextResponse.json({ error: "Results not found." }, { status: 404 });
  }

  if (results.ai_analysis) {
    return NextResponse.json({ analysis: results.ai_analysis as AiAnalysis, cached: true });
  }

  const { data: missedRows } = await supabase
    .from("diagnostic_responses")
    .select(
      "selected_answer, question:diagnostic_questions(question_text, domain, skill, difficulty, correct_answer, explanation)"
    )
    .eq("attempt_id", attemptId)
    .eq("is_correct", false)
    .limit(MAX_MISSED_QUESTIONS_IN_PROMPT);

  const missed = ((missedRows || []) as unknown as (MissedQuestionRow & { question: MissedQuestionRow["question"] })[])
    .filter((r) => r.question)
    .map((r) => ({
      skill: r.question!.skill,
      domain: r.question!.domain,
      difficulty: r.question!.difficulty,
      yourAnswer: r.selected_answer,
      correctAnswer: r.question!.correct_answer,
      explanation: r.question!.explanation,
    }));

  // Real prerequisite/related edges for this student's weak skills, looked
  // up from diagnostic_skill_relationships -- grounds downstreamConcepts in
  // an actual authored graph instead of letting the model invent one from
  // accuracy stats alone (see that table's migration for provenance/limits:
  // only ~18 seeded edges today, so this is often empty).
  const weakestSkillNames = (
    (results.weakest_skills || []) as { skill: string }[]
  ).map((s) => s.skill);

  let groundedPrerequisites: AiAnalysis["groundedPrerequisites"] = [];
  if (weakestSkillNames.length > 0) {
    const { data: relationshipRows } = await supabase
      .from("diagnostic_skill_relationships")
      .select("skill, related_skill, relationship_type, confidence, notes")
      .eq("exam_id", attempt.exam_id)
      .in("skill", weakestSkillNames);

    groundedPrerequisites = (relationshipRows || []).map((r) => ({
      skill: r.skill,
      relatedSkill: r.related_skill,
      relationshipType: r.relationship_type,
      confidence: r.confidence,
      notes: r.notes,
    }));
  }

  const prompt = `
You are an expert tutor writing a personalized diagnostic analysis for a student, based ONLY on the data below. Never invent facts not supported by this data. Do not simply restate percentages -- explain the PATTERN behind the mistakes.

Overall accuracy: ${results.overall_accuracy}%
Readiness: ${results.readiness_tier} (${results.readiness_score}/100)
Skill-by-skill results: ${JSON.stringify(results.skill_results)}
Difficulty breakdown: ${JSON.stringify(results.difficulty_results)}
Strongest skills: ${JSON.stringify(results.strongest_skills)}
Weakest/highest-priority skills: ${JSON.stringify(results.weakest_skills)}
Most common mistakes (by miss count): ${JSON.stringify(results.common_mistakes)}
Pacing: ${JSON.stringify(results.pacing_results)}
Sample of missed questions (up to ${MAX_MISSED_QUESTIONS_IN_PROMPT}): ${JSON.stringify(missed)}
Authored prerequisite/related-skill relationships for this student's weakest skills (ground truth -- use these for downstreamConcepts when present; do not invent additional relationships beyond this list): ${groundedPrerequisites.length > 0 ? JSON.stringify(groundedPrerequisites) : "None authored yet for these specific skills -- write downstreamConcepts as a general statement about why the weak skill matters, without claiming a specific prerequisite chain."}

Write:
- summary: 2-3 sentences, the single biggest takeaway from this diagnostic.
- whyStruggled: 2-4 sentences explaining WHY the student likely struggled where they did (a real pattern -- e.g. a prerequisite gap, a specific misconception, a pacing issue -- not just "needs more practice").
- downstreamConcepts: 1-3 sentences on which concepts, if left unaddressed, will cause mistakes on LATER/harder material too (a prerequisite-gap analysis). If the authored relationships above are non-empty, base this on them specifically (name the related skill). If empty, keep this general and do not name a specific downstream skill you're not given evidence for.
- learnFirst: array of 2-4 skill/concept names to study first, in priority order.
- canSkipForNow: array of 0-3 skill/concept names that are already strong enough to deprioritize for now.
- estimatedStudyHours: a realistic number of hours to close the gaps identified (integer).
- priorityOrder: array of 2-5 short, ordered next-action strings (e.g. "Review linear equations fundamentals", "Retake a weak-area retest on punctuation").

Return ONLY valid JSON: {"summary": string, "whyStruggled": string, "downstreamConcepts": string, "learnFirst": [string], "canSkipForNow": [string], "estimatedStudyHours": number, "priorityOrder": [string]}
`.trim();

  let analysis: AiAnalysis;
  try {
    const completion = await openai.chat.completions.create({
      model: TERRA_TASK.model,
      reasoning_effort: TERRA_TASK.reasoning_effort,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty response");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    analysis = {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      whyStruggled: typeof parsed.whyStruggled === "string" ? parsed.whyStruggled : "",
      downstreamConcepts: typeof parsed.downstreamConcepts === "string" ? parsed.downstreamConcepts : "",
      learnFirst: Array.isArray(parsed.learnFirst) ? (parsed.learnFirst as string[]) : [],
      canSkipForNow: Array.isArray(parsed.canSkipForNow) ? (parsed.canSkipForNow as string[]) : [],
      estimatedStudyHours: typeof parsed.estimatedStudyHours === "number" ? parsed.estimatedStudyHours : 5,
      priorityOrder: Array.isArray(parsed.priorityOrder) ? (parsed.priorityOrder as string[]) : [],
      groundedPrerequisites,
    };
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Could not generate your analysis: ${err.message}` : "Could not generate your analysis." },
      { status: 502 }
    );
  }

  await supabase.from("diagnostic_results").update({ ai_analysis: analysis }).eq("attempt_id", attemptId);

  return NextResponse.json({ analysis, cached: false });
}
