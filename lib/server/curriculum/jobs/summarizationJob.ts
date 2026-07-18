import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { summarizeChunksBatch, summarizeFromChildren, type SummaryContent } from "@/lib/server/curriculum/summarization";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

const CHUNKS_PER_API_CALL = 5;
const CHUNKS_PER_INVOCATION = 40;

type SummarizationPayload = {
  scope: "document" | "course";
  phase?: "chunk" | "section" | "chapter" | "course" | "done";
};

function summaryRow(args: {
  courseId: string;
  documentId: string | null;
  level: string;
  sourceChunkIds: string[];
  content: SummaryContent;
}) {
  return {
    course_id: args.courseId,
    document_id: args.documentId,
    summary_level: args.level,
    source_chunk_ids: args.sourceChunkIds,
    title: args.content.title,
    summary_text: args.content.summary,
    key_facts: args.content.keyFacts,
    definitions: args.content.definitions,
    formulas: args.content.formulas,
    procedures: args.content.procedures,
    dates: args.content.dates,
    vocabulary: args.content.vocabulary,
    examples: args.content.examples,
    exceptions: args.content.exceptions,
    relationships: args.content.relationships,
    misconceptions: args.content.misconceptions,
    learning_objectives: args.content.learningObjectives,
  };
}

function rowToSummaryContent(row: {
  title: string | null;
  summary_text: string;
  key_facts: unknown;
  definitions: unknown;
  formulas: unknown;
  procedures: unknown;
  dates: unknown;
  vocabulary: unknown;
  examples: unknown;
  exceptions: unknown;
  relationships: unknown;
  misconceptions: unknown;
  learning_objectives: unknown;
}): SummaryContent {
  return {
    title: row.title || "",
    summary: row.summary_text,
    keyFacts: (row.key_facts as string[]) || [],
    definitions: (row.definitions as string[]) || [],
    formulas: (row.formulas as string[]) || [],
    procedures: (row.procedures as string[]) || [],
    dates: (row.dates as string[]) || [],
    vocabulary: (row.vocabulary as string[]) || [],
    examples: (row.examples as string[]) || [],
    exceptions: (row.exceptions as string[]) || [],
    relationships: (row.relationships as string[]) || [],
    misconceptions: (row.misconceptions as string[]) || [],
    learningObjectives: (row.learning_objectives as string[]) || [],
  };
}

// Checks whether every OTHER active pipeline job for this course (any
// document-scoped stage) has finished -- the gate for "safe to roll this
// document's chapter summaries up into a course-level summary now."
async function isCourseReadyForRollup(courseId: string, excludeJobId: string): Promise<boolean> {
  const supabase = getServiceSupabaseClient();
  const { count } = await supabase
    .from("processing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .neq("id", excludeJobId)
    .in("job_type", ["document_ingestion", "chunking", "indexing", "summarization"])
    .in("status", ["queued", "running"]);

  return (count || 0) === 0;
}

async function runDocumentScopeSummarization(
  job: { id: string; course_id: string; document_id: string },
  payload: SummarizationPayload,
  timeBudgetMs: number
): Promise<{ done: boolean; message: string; nextPhase?: SummarizationPayload["phase"] }> {
  const supabase = getServiceSupabaseClient();
  const startedAt = Date.now();
  const phase = payload.phase || "chunk";

  if (phase === "chunk") {
    const { data: chunks } = await supabase
      .from("content_chunks")
      .select("id, content")
      .eq("document_id", job.document_id);

    const { data: existingSummaries } = await supabase
      .from("content_summaries")
      .select("source_chunk_ids")
      .eq("document_id", job.document_id)
      .eq("summary_level", "chunk");

    const alreadySummarized = new Set((existingSummaries || []).flatMap((s) => s.source_chunk_ids as string[]));
    const pending = (chunks || []).filter((c) => !alreadySummarized.has(c.id)).slice(0, CHUNKS_PER_INVOCATION);

    if (pending.length === 0) {
      return { done: false, message: "Chunk summaries complete, moving to section rollup.", nextPhase: "section" };
    }

    for (let i = 0; i < pending.length; i += CHUNKS_PER_API_CALL) {
      if (Date.now() - startedAt > timeBudgetMs) break;
      const batch = pending.slice(i, i + CHUNKS_PER_API_CALL);
      const summaries = await summarizeChunksBatch(batch);

      const rows = batch
        .filter((c) => summaries.has(c.id))
        .map((c) =>
          summaryRow({
            courseId: job.course_id,
            documentId: job.document_id,
            level: "chunk",
            sourceChunkIds: [c.id],
            content: summaries.get(c.id) as SummaryContent,
          })
        );
      if (rows.length > 0) {
        await supabase.from("content_summaries").insert(rows);
      }
    }

    return { done: false, message: `Summarized a batch of chunks for document ${job.document_id}.`, nextPhase: "chunk" };
  }

  if (phase === "section") {
    const { data: chunkSummaries } = await supabase
      .from("content_summaries")
      .select("*")
      .eq("document_id", job.document_id)
      .eq("summary_level", "chunk")
      .is("parent_summary_id", null);

    if (!chunkSummaries || chunkSummaries.length === 0) {
      return { done: false, message: "No chunk summaries to roll up.", nextPhase: "chapter" };
    }

    const chunkIds = chunkSummaries.flatMap((s) => s.source_chunk_ids as string[]);
    const { data: chunkRows } = await supabase
      .from("content_chunks")
      .select("id, section, chapter")
      .in("id", chunkIds);

    const sectionByChunkId = new Map((chunkRows || []).map((c) => [c.id, c.section || "General"]));

    const groups = new Map<string, typeof chunkSummaries>();
    for (const summary of chunkSummaries) {
      const chunkId = (summary.source_chunk_ids as string[])[0];
      const section = sectionByChunkId.get(chunkId) || "General";
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section)!.push(summary);
    }

    for (const [section, members] of groups) {
      if (Date.now() - startedAt > timeBudgetMs) break;
      const children = members.map((m) => rowToSummaryContent(m));
      const rolledUp = await summarizeFromChildren({ children, levelLabel: "section", title: section });

      const { data: inserted } = await supabase
        .from("content_summaries")
        .insert(
          summaryRow({
            courseId: job.course_id,
            documentId: job.document_id,
            level: "section",
            sourceChunkIds: members.flatMap((m) => m.source_chunk_ids as string[]),
            content: rolledUp,
          })
        )
        .select("id")
        .single();

      if (inserted) {
        await supabase
          .from("content_summaries")
          .update({ parent_summary_id: inserted.id })
          .in("id", members.map((m) => m.id));
      }
    }

    return { done: false, message: "Section-level summaries created.", nextPhase: "chapter" };
  }

  if (phase === "chapter") {
    const { data: sectionSummaries } = await supabase
      .from("content_summaries")
      .select("*")
      .eq("document_id", job.document_id)
      .eq("summary_level", "section")
      .is("parent_summary_id", null);

    if (!sectionSummaries || sectionSummaries.length === 0) {
      return { done: false, message: "No section summaries to roll up.", nextPhase: "done" };
    }

    const firstChunkIds = sectionSummaries.map((s) => (s.source_chunk_ids as string[])[0]);
    const { data: chunkRows } = await supabase.from("content_chunks").select("id, chapter").in("id", firstChunkIds);
    const chapterByChunkId = new Map((chunkRows || []).map((c) => [c.id, c.chapter || "General"]));

    const groups = new Map<string, typeof sectionSummaries>();
    for (const summary of sectionSummaries) {
      const chunkId = (summary.source_chunk_ids as string[])[0];
      const chapter = chapterByChunkId.get(chunkId) || "General";
      if (!groups.has(chapter)) groups.set(chapter, []);
      groups.get(chapter)!.push(summary);
    }

    for (const [chapter, members] of groups) {
      if (Date.now() - startedAt > timeBudgetMs) break;
      const children = members.map((m) => rowToSummaryContent(m));
      const rolledUp = await summarizeFromChildren({ children, levelLabel: "chapter", title: chapter });

      const { data: inserted } = await supabase
        .from("content_summaries")
        .insert(
          summaryRow({
            courseId: job.course_id,
            documentId: job.document_id,
            level: "chapter",
            sourceChunkIds: members.flatMap((m) => m.source_chunk_ids as string[]),
            content: rolledUp,
          })
        )
        .select("id")
        .single();

      if (inserted) {
        await supabase
          .from("content_summaries")
          .update({ parent_summary_id: inserted.id })
          .in("id", members.map((m) => m.id));
      }
    }

    return { done: false, message: "Chapter-level summaries created.", nextPhase: "done" };
  }

  return { done: true, message: "Document summarization complete." };
}

async function runCourseScopeSummarization(job: { id: string; course_id: string }): Promise<{ done: boolean; message: string }> {
  const supabase = getServiceSupabaseClient();

  const { data: chapterSummaries } = await supabase
    .from("content_summaries")
    .select("*")
    .eq("course_id", job.course_id)
    .eq("summary_level", "chapter")
    .is("parent_summary_id", null);

  if (!chapterSummaries || chapterSummaries.length === 0) {
    return { done: true, message: "No chapter summaries available for course-level rollup." };
  }

  const { data: course } = await supabase.from("courses").select("name").eq("id", job.course_id).single();
  const children = chapterSummaries.map((c) => rowToSummaryContent(c));
  const rolledUp = await summarizeFromChildren({ children, levelLabel: "course", title: course?.name || "Course" });

  const { data: inserted } = await supabase
    .from("content_summaries")
    .insert(
      summaryRow({
        courseId: job.course_id,
        documentId: null,
        level: "course",
        sourceChunkIds: [],
        content: rolledUp,
      })
    )
    .select("id")
    .single();

  if (inserted) {
    await supabase
      .from("content_summaries")
      .update({ parent_summary_id: inserted.id })
      .in("id", chapterSummaries.map((c) => c.id));
  }

  return { done: true, message: "Course-level summary created." };
}

export const runSummarizationJob: JobHandler = async (job, timeBudgetMs) => {
  const payload = (job.payload as SummarizationPayload) || { scope: job.document_id ? "document" : "course" };

  if (payload.scope === "course" || !job.document_id) {
    const result = await runCourseScopeSummarization({ id: job.id, course_id: job.course_id });
    return { done: true, message: result.message };
  }

  const result = await runDocumentScopeSummarization(
    { id: job.id, course_id: job.course_id, document_id: job.document_id },
    payload,
    timeBudgetMs
  );

  if (!result.done) {
    return { done: false, payload: { scope: "document", phase: result.nextPhase }, message: result.message };
  }

  // This document's summarization finished -- if every sibling document in
  // the course has also cleared ingestion/chunking/indexing/summarization,
  // it's safe to roll everything up into a course-level summary
  // (Section 9's "Map concepts" stage comes after this and is queued as a
  // dormant job -- it'll sit harmlessly until Section 5 adds its handler).
  const ready = await isCourseReadyForRollup(job.course_id, job.id);
  if (ready) {
    await enqueueJob({ courseId: job.course_id, jobType: "summarization", payload: { scope: "course" } });
    await enqueueJob({ courseId: job.course_id, jobType: "concept_mapping" });
  }

  return { done: true, message: result.message };
};
