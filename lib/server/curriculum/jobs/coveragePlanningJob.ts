import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { computeCoverageEntry, HARD_DIFFICULTY_THRESHOLD } from "@/lib/server/curriculum/coverage";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

type SupportingPage = { documentId: string; pageStart: number; pageEnd: number };

function countPages(supportingPages: unknown): number {
  if (!Array.isArray(supportingPages)) return 0;
  return (supportingPages as SupportingPage[]).reduce((sum, p) => {
    if (typeof p.pageStart !== "number" || typeof p.pageEnd !== "number") return sum;
    return sum + Math.max(0, p.pageEnd - p.pageStart + 1);
  }, 0);
}

// Purely deterministic aggregation (concepts + approved curriculum_questions
// counts) -- no AI calls, so unlike the extraction-heavy stages this always
// completes in a single invocation regardless of course size.
export const runCoveragePlanningJob: JobHandler = async (job) => {
  const supabase = getServiceSupabaseClient();

  const { data: concepts, error: conceptsError } = await supabase
    .from("concepts")
    .select("id, importance, supporting_pages")
    .eq("course_id", job.course_id)
    .eq("concept_level", "concept");

  if (conceptsError) {
    throw new Error(`Failed to load concepts: ${conceptsError.message}`);
  }

  if (!concepts || concepts.length === 0) {
    return { done: true, message: "No concepts mapped yet -- nothing to plan coverage for." };
  }

  const { data: approvedQuestions, error: questionsError } = await supabase
    .from("curriculum_questions")
    .select("concept_id, difficulty")
    .eq("course_id", job.course_id)
    .eq("status", "approved")
    .not("concept_id", "is", null);

  if (questionsError) {
    throw new Error(`Failed to load approved questions: ${questionsError.message}`);
  }

  const questionsByConcept = new Map<string, { count: number; hasHard: boolean }>();
  for (const q of approvedQuestions || []) {
    const conceptId = q.concept_id as string;
    const existing = questionsByConcept.get(conceptId) || { count: 0, hasHard: false };
    existing.count += 1;
    if ((q.difficulty || 0) >= HARD_DIFFICULTY_THRESHOLD) existing.hasHard = true;
    questionsByConcept.set(conceptId, existing);
  }

  // Supersede any previous "ready" plan rather than mutating it in place --
  // preserves coverage history over time.
  await supabase
    .from("coverage_plans")
    .update({ status: "stale" })
    .eq("course_id", job.course_id)
    .eq("status", "ready");

  const { data: plan, error: planError } = await supabase
    .from("coverage_plans")
    .insert({ course_id: job.course_id, status: "computing" })
    .select("id")
    .single();

  if (planError || !plan) {
    throw new Error(`Failed to create coverage plan: ${planError?.message}`);
  }

  const entries = concepts.map((concept) => {
    const stats = questionsByConcept.get(concept.id) || { count: 0, hasHard: false };
    return computeCoverageEntry({
      conceptId: concept.id,
      importance: concept.importance,
      sourcePageCount: countPages(concept.supporting_pages),
      approvedQuestionCount: stats.count,
      hasHardApprovedQuestion: stats.hasHard,
    });
  });

  const { error: entriesError } = await supabase.from("coverage_matrix_entries").insert(
    entries.map((e) => ({
      coverage_plan_id: plan.id,
      concept_id: e.conceptId,
      source_page_count: e.sourcePageCount,
      importance: e.importance,
      question_target: e.questionTarget,
      approved_question_count: e.approvedQuestionCount,
      coverage_status: e.coverageStatus,
      needs_harder_questions: e.needsHarderQuestions,
    }))
  );

  if (entriesError) {
    throw new Error(`Failed to insert coverage matrix entries: ${entriesError.message}`);
  }

  const conceptsCovered = entries.filter((e) => e.coverageStatus === "covered" || e.coverageStatus === "over_covered").length;

  await supabase
    .from("coverage_plans")
    .update({
      status: "ready",
      total_concepts: entries.length,
      concepts_covered: conceptsCovered,
      overall_coverage_percent: entries.length > 0 ? Math.round((conceptsCovered / entries.length) * 1000) / 10 : 0,
      computed_at: new Date().toISOString(),
    })
    .eq("id", plan.id);

  // Next pipeline stage (Section 7) -- dormant until its handler exists.
  // The generator reads coverage_matrix_entries to know which concepts
  // still need questions and at what difficulty, rather than generating
  // blindly.
  await enqueueJob({ courseId: job.course_id, jobType: "question_generation", payload: { coveragePlanId: plan.id } });

  return {
    done: true,
    message: `Coverage plan ready: ${conceptsCovered}/${entries.length} concepts covered (${entries.length > 0 ? Math.round((conceptsCovered / entries.length) * 100) : 0}%). Full-course coverage is NOT claimed until every concept clears review -- see coverage_plans.overall_coverage_percent, not an assumption.`,
  };
};
