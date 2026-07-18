import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { generateQuestionsForConcept, type SourceExcerpt } from "@/lib/server/curriculum/questionGeneration";
import { hybridRetrieve } from "@/lib/server/curriculum/retrieval";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

// Cap per concept per invocation -- keeps one API call's prompt/response
// bounded regardless of how far under target a concept is; a concept still
// short after this many will simply get generated further on the next
// coverage_planning -> question_generation cycle (see the loop closed in
// questionVerificationJob.ts).
const MAX_QUESTIONS_PER_CONCEPT_CALL = 6;
const MAX_EXCERPTS_PER_CONCEPT = 6;

type GenerationPayload = {
  coveragePlanId?: string;
  // Concepts already processed by THIS job run -- distinct from "already
  // covered," since a just-generated question is 'pending_verification',
  // not yet 'approved', so the coverage matrix snapshot this job started
  // from would otherwise look unchanged and the same concept would be
  // reprocessed forever within one run.
  processedConceptIds?: string[];
};

type MatrixEntryRow = {
  concept_id: string;
  question_target: number;
  approved_question_count: number;
  needs_harder_questions: boolean;
};

type SupportingPage = { documentId: string; pageStart: number; pageEnd: number };

async function loadExcerptsForConcept(args: {
  courseId: string;
  conceptName: string;
  conceptDescription: string | null;
  supportingPages: unknown;
}): Promise<SourceExcerpt[]> {
  const supabase = getServiceSupabaseClient();
  const pages = Array.isArray(args.supportingPages) ? (args.supportingPages as SupportingPage[]) : [];

  const chunks: { id: string; document_id: string; page_start: number; page_end: number; content: string }[] = [];
  for (const page of pages.slice(0, 4)) {
    if (typeof page.documentId !== "string" || typeof page.pageStart !== "number" || typeof page.pageEnd !== "number") continue;
    const { data } = await supabase
      .from("content_chunks")
      .select("id, document_id, page_start, page_end, content")
      .eq("document_id", page.documentId)
      .lte("page_start", page.pageEnd)
      .gte("page_end", page.pageStart)
      .limit(MAX_EXCERPTS_PER_CONCEPT);
    if (data) chunks.push(...data);
  }

  // Fallback when the concept's recorded supporting pages don't map to any
  // chunk directly (e.g. a rolled-up concept spanning parts the chunker
  // split differently) -- hybrid retrieval by concept name/description
  // finds the closest real content instead of failing generation outright.
  if (chunks.length === 0) {
    const retrieved = await hybridRetrieve({
      courseId: args.courseId,
      queryText: `${args.conceptName}. ${args.conceptDescription || ""}`.trim(),
      matchCount: MAX_EXCERPTS_PER_CONCEPT,
    });
    return retrieved.map((r, i) => ({
      index: i + 1,
      chunkId: r.chunkId,
      documentId: r.documentId,
      pageStart: r.pageStart,
      pageEnd: r.pageEnd,
      text: r.content,
    }));
  }

  const deduped = Array.from(new Map(chunks.map((c) => [c.id, c])).values()).slice(0, MAX_EXCERPTS_PER_CONCEPT);
  return deduped.map((c, i) => ({
    index: i + 1,
    chunkId: c.id,
    documentId: c.document_id,
    pageStart: c.page_start,
    pageEnd: c.page_end,
    text: c.content,
  }));
}

// Reads the coverage matrix (Section 6's output) to know exactly which
// concepts still need questions and at what volume/difficulty, rather than
// generating blindly across the whole course every run (Section 7).
export const runQuestionGenerationJob: JobHandler = async (job, timeBudgetMs) => {
  const supabase = getServiceSupabaseClient();
  const payload = (job.payload as GenerationPayload) || {};
  const processed = new Set(payload.processedConceptIds || []);
  const startedAt = Date.now();

  let coveragePlanId = payload.coveragePlanId;
  if (!coveragePlanId) {
    const { data: plan } = await supabase
      .from("coverage_plans")
      .select("id")
      .eq("course_id", job.course_id)
      .eq("status", "ready")
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!plan) return { done: true, message: "No ready coverage plan for this course -- nothing to generate against yet." };
    coveragePlanId = plan.id;
  }

  const { data: entries, error: entriesError } = await supabase
    .from("coverage_matrix_entries")
    .select("concept_id, question_target, approved_question_count, coverage_status, needs_harder_questions")
    .eq("coverage_plan_id", coveragePlanId)
    .in("coverage_status", ["not_covered", "under_covered"]);

  if (entriesError) throw new Error(`Failed to load coverage matrix: ${entriesError.message}`);

  const pending = (entries || []).filter((e) => !processed.has(e.concept_id)) as MatrixEntryRow[];

  if (pending.length === 0) {
    await enqueueJob({ courseId: job.course_id, jobType: "question_verification" });
    return {
      done: true,
      message: `Question generation complete for coverage plan ${coveragePlanId} -- ${processed.size} concept(s) processed this run.`,
    };
  }

  let generatedCount = 0;
  for (const entry of pending) {
    if (Date.now() - startedAt > timeBudgetMs) break;

    const { data: concept } = await supabase
      .from("concepts")
      .select("id, name, description, importance, difficulty, common_mistakes, supporting_pages")
      .eq("id", entry.concept_id)
      .maybeSingle();

    processed.add(entry.concept_id);
    if (!concept) continue;

    const needed = entry.question_target - entry.approved_question_count;
    const count = Math.max(1, Math.min(MAX_QUESTIONS_PER_CONCEPT_CALL, needed > 0 ? needed : 1));

    const excerpts = await loadExcerptsForConcept({
      courseId: job.course_id,
      conceptName: concept.name,
      conceptDescription: concept.description,
      supportingPages: concept.supporting_pages,
    });

    if (excerpts.length === 0) continue; // Nothing groundable yet -- next coverage cycle will retry.

    const drafts = await generateQuestionsForConcept({
      concept: {
        name: concept.name,
        description: concept.description,
        importance: concept.importance,
        difficulty: concept.difficulty,
        commonMistakes: Array.isArray(concept.common_mistakes) ? (concept.common_mistakes as string[]) : [],
      },
      excerpts,
      count,
      biasHarder: entry.needs_harder_questions,
    });

    const excerptByIndex = new Map(excerpts.map((e) => [e.index, e]));

    for (const draft of drafts) {
      const { data: inserted, error: insertError } = await supabase
        .from("curriculum_questions")
        .insert({
          course_id: job.course_id,
          concept_id: concept.id,
          question_text: draft.questionText,
          question_type: draft.questionType,
          cognitive_level: draft.cognitiveLevel,
          choices: draft.choices,
          correct_answer: draft.correctAnswer,
          accepted_answers: draft.acceptedAnswers,
          explanation: draft.explanation,
          difficulty: draft.difficulty,
          common_mistake: draft.commonMistake,
          status: "pending_verification",
        })
        .select("id")
        .single();

      // Exact-duplicate collisions (curriculum_questions_course_text_unique)
      // are expected and silently skipped -- the near-duplicate case is
      // caught later by question_verification's deterministic check.
      if (insertError) {
        if (insertError.code !== "23505") console.error(`Failed to insert generated question: ${insertError.message}`);
        continue;
      }
      if (!inserted) continue;

      const sourceRows = draft.citedExcerptIndexes
        .map((idx) => excerptByIndex.get(idx))
        .filter((e): e is SourceExcerpt => !!e)
        .map((e) => ({
          question_id: inserted.id,
          chunk_id: e.chunkId,
          document_id: e.documentId,
          page_start: e.pageStart,
          page_end: e.pageEnd,
          // Bounded excerpt, not the full page -- Section 15's "never
          // expose full pages, only a supporting excerpt."
          supporting_excerpt: e.text.slice(0, 1200),
        }));

      if (sourceRows.length > 0) {
        await supabase.from("question_sources").insert(sourceRows);
      }
      generatedCount += 1;
    }
  }

  const allProcessed = pending.every((e) => processed.has(e.concept_id));
  if (!allProcessed) {
    return {
      done: false,
      payload: { coveragePlanId, processedConceptIds: Array.from(processed) },
      message: `Generated ${generatedCount} question(s) this batch; more concepts remain.`,
    };
  }

  await enqueueJob({ courseId: job.course_id, jobType: "question_verification" });
  return {
    done: true,
    message: `Question generation pass complete: ${generatedCount} question(s) generated across ${processed.size} concept(s), now pending verification.`,
  };
};
