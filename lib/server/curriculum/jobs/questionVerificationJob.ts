import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { verifyQuestionAgainstSource, type StageResult } from "@/lib/server/curriculum/questionVerification";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

// Re-queries "questions still pending_verification" fresh each invocation
// (same resumability pattern as indexingJob.ts) rather than tracking a
// cursor -- a question's status changes to approved/needs_repair/rejected
// as soon as this job finishes with it, so the next query naturally never
// sees it again.
const QUESTIONS_PER_INVOCATION = 15;
// Near-duplicate risk threshold, matched to
// find_similar_curriculum_questions' default p_threshold.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.55;

type ReviewRow = {
  question_id: string;
  review_stage: string;
  passed: boolean;
  score: number;
  reviewer_type: "ai" | "deterministic_tool";
  notes: string;
};

function stageRow(questionId: string, stage: string, result: StageResult, reviewerType: ReviewRow["reviewer_type"]): ReviewRow {
  return {
    question_id: questionId,
    review_stage: stage,
    passed: result.passed,
    score: result.score,
    reviewer_type: reviewerType,
    notes: result.notes,
  };
}

// Section 8's validation chain: source_grounding -> answer_verification ->
// curriculum_alignment -> difficulty_classification -> duplicate_detection
// -> ambiguity_check -> final_approval. Each stage writes its own
// question_reviews row (matches the review_stage check constraint exactly)
// so a rejected question's failure reason is always inspectable later, not
// just a final pass/fail.
export const runQuestionVerificationJob: JobHandler = async (job, timeBudgetMs) => {
  const supabase = getServiceSupabaseClient();
  const startedAt = Date.now();

  const { data: questions, error: questionsError } = await supabase
    .from("curriculum_questions")
    .select("id, concept_id, question_text, question_type, correct_answer, accepted_answers, explanation, difficulty, choices")
    .eq("course_id", job.course_id)
    .eq("status", "pending_verification")
    .order("created_at", { ascending: true })
    .limit(QUESTIONS_PER_INVOCATION);

  if (questionsError) throw new Error(`Failed to load pending questions: ${questionsError.message}`);

  if (!questions || questions.length === 0) {
    // Loop closure (Section 9): now that a batch of questions has resolved
    // to approved/needs_repair/rejected, recompute coverage so a still-gappy
    // concept gets another question_generation pass automatically.
    // Bounded by processing_jobs_one_active_per_stage (never more than one
    // active cycle at a time) -- NOT bounded on total number of cycles, so
    // a concept that keeps failing verification will keep being
    // regenerated every cycle. Worth adding a per-concept generation
    // attempt cap before running this unattended at real scale (OpenAI
    // spend), flagging rather than silently building a cap value that
    // would just be a guess.
    await enqueueJob({ courseId: job.course_id, jobType: "coverage_planning" });
    return { done: true, message: "No questions pending verification." };
  }

  let approvedCount = 0;
  let repairCount = 0;
  let rejectedCount = 0;

  for (const question of questions) {
    if (Date.now() - startedAt > timeBudgetMs) break;

    const { data: sources } = await supabase
      .from("question_sources")
      .select("chunk_id, document_id, page_start, page_end, supporting_excerpt")
      .eq("question_id", question.id);

    const reviewRows: ReviewRow[] = [];

    if (!sources || sources.length === 0) {
      // Can't verify grounding without any recorded source excerpt --
      // auto-fail rather than skip, since a question with no traceable
      // source should never reach a student regardless of why it lacks one.
      reviewRows.push(
        stageRow(question.id, "source_grounding", { passed: false, score: 0, notes: "No question_sources rows recorded." }, "deterministic_tool")
      );
      await supabase.from("question_reviews").insert(reviewRows);
      await supabase
        .from("curriculum_questions")
        .update({ status: "rejected", verification_score: 0, updated_at: new Date().toISOString() })
        .eq("id", question.id);
      rejectedCount += 1;
      continue;
    }

    const { data: concept } = await supabase
      .from("concepts")
      .select("name, description")
      .eq("id", question.concept_id)
      .maybeSingle();

    const aiResult = await verifyQuestionAgainstSource({
      question: {
        questionText: question.question_text,
        questionType: question.question_type,
        correctAnswer: question.correct_answer || "",
        acceptedAnswers: Array.isArray(question.accepted_answers) ? (question.accepted_answers as string[]) : [],
        explanation: question.explanation,
        difficulty: question.difficulty,
        choices: Array.isArray(question.choices) ? question.choices : [],
      },
      concept: { name: concept?.name || "Unknown concept", description: concept?.description || null },
      excerpts: sources.map((s) => ({
        pageStart: s.page_start ?? 0,
        pageEnd: s.page_end ?? 0,
        text: s.supporting_excerpt,
      })),
    });

    reviewRows.push(
      stageRow(question.id, "source_grounding", aiResult.sourceGrounding, "ai"),
      stageRow(question.id, "answer_verification", aiResult.answerVerification, "ai"),
      stageRow(question.id, "curriculum_alignment", aiResult.curriculumAlignment, "ai"),
      // Difficulty classification always records its own passed/score for
      // audit, but -- see below -- never gates final_approval.
      stageRow(question.id, "difficulty_classification", aiResult.difficultyClassification, "ai"),
      stageRow(question.id, "ambiguity_check", aiResult.ambiguityCheck, "ai")
    );

    const { data: similar } = await supabase.rpc("find_similar_curriculum_questions", {
      p_course_id: job.course_id,
      p_concept_id: question.concept_id,
      p_question_text: question.question_text,
      p_exclude_question_id: question.id,
      p_threshold: DUPLICATE_SIMILARITY_THRESHOLD,
      p_limit: 1,
    });
    const maxSimilarity = similar && similar.length > 0 ? (similar[0].similarity as number) : 0;
    const duplicateResult: StageResult = {
      passed: maxSimilarity < DUPLICATE_SIMILARITY_THRESHOLD,
      score: 1 - maxSimilarity,
      notes:
        maxSimilarity >= DUPLICATE_SIMILARITY_THRESHOLD
          ? `${Math.round(maxSimilarity * 100)}% textually similar to an existing question for this concept.`
          : "No near-duplicate found.",
    };
    reviewRows.push(stageRow(question.id, "duplicate_detection", duplicateResult, "deterministic_tool"));

    // Difficulty classification RE-LABELS rather than gates: its job is to
    // classify difficulty accurately, not to approve/reject the question,
    // so a claimed-vs-actual mismatch alone should never block an
    // otherwise-sound question. The five stages below ARE the approval
    // gate.
    const gatingPassed =
      aiResult.sourceGrounding.passed &&
      aiResult.answerVerification.passed &&
      aiResult.curriculumAlignment.passed &&
      aiResult.ambiguityCheck.passed &&
      duplicateResult.passed;

    reviewRows.push(
      stageRow(
        question.id,
        "final_approval",
        {
          passed: gatingPassed,
          score:
            (aiResult.sourceGrounding.score +
              aiResult.answerVerification.score +
              aiResult.curriculumAlignment.score +
              aiResult.ambiguityCheck.score +
              duplicateResult.score) /
            5,
          notes: gatingPassed ? "All gating stages passed." : "One or more gating stages failed -- see individual stage rows.",
        },
        "deterministic_tool"
      )
    );

    await supabase.from("question_reviews").insert(reviewRows);

    const finalRow = reviewRows[reviewRows.length - 1];
    const updates: Record<string, unknown> = {
      verification_score: finalRow.score,
      updated_at: new Date().toISOString(),
    };

    if (gatingPassed) {
      updates.status = "approved";
      // Self-correct drift the classifier flagged, now that the question is
      // otherwise confirmed sound.
      if (aiResult.difficultyClassification.suggestedDifficulty !== question.difficulty) {
        updates.difficulty = aiResult.difficultyClassification.suggestedDifficulty;
      }
      approvedCount += 1;
    } else if (!aiResult.sourceGrounding.passed || duplicateResult.passed === false) {
      // Fundamentally unusable (unsupported by source) or redundant --
      // regenerating from scratch is more productive than trying to patch it.
      updates.status = "rejected";
      rejectedCount += 1;
    } else {
      // Salvageable: alignment/answer/ambiguity issues that a future
      // targeted repair pass could fix without discarding the question
      // entirely. No repair-generation handler exists yet -- this status
      // just keeps the door open for one rather than forcing "rejected."
      updates.status = "needs_repair";
      repairCount += 1;
    }

    await supabase.from("curriculum_questions").update(updates).eq("id", question.id);
  }

  const { count: remaining } = await supabase
    .from("curriculum_questions")
    .select("id", { count: "exact", head: true })
    .eq("course_id", job.course_id)
    .eq("status", "pending_verification");

  const summary = `Verified a batch: ${approvedCount} approved, ${repairCount} needs_repair, ${rejectedCount} rejected.`;

  if ((remaining || 0) > 0) {
    return { done: false, payload: {}, message: `${summary} ${remaining} still pending.` };
  }

  // See the "no questions pending" branch above for the loop-closure
  // reasoning and its known unbounded-cycles caveat.
  await enqueueJob({ courseId: job.course_id, jobType: "coverage_planning" });
  return { done: true, message: `${summary} All pending questions in this batch cycle resolved.` };
};
