import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { extractConceptsFromChapterSummary } from "@/lib/server/curriculum/conceptMapping";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

const CHAPTERS_PER_INVOCATION = 8;

type ConceptMappingPayload = {
  processedChapterSummaryIds?: string[];
};

export const runConceptMappingJob: JobHandler = async (job, timeBudgetMs) => {
  const startedAt = Date.now();
  const supabase = getServiceSupabaseClient();
  const payload = (job.payload as ConceptMappingPayload) || {};
  const processedIds = new Set(payload.processedChapterSummaryIds || []);

  const { data: chapterSummaries, error: summariesError } = await supabase
    .from("content_summaries")
    .select("*")
    .eq("course_id", job.course_id)
    .eq("summary_level", "chapter");

  if (summariesError) {
    throw new Error(`Failed to load chapter summaries: ${summariesError.message}`);
  }

  const pending = (chapterSummaries || []).filter((s) => !processedIds.has(s.id)).slice(0, CHAPTERS_PER_INVOCATION);

  if (pending.length === 0 && processedIds.size === 0) {
    // No chapters were ever summarized (e.g. an empty/failed course) --
    // nothing to map, but not an error either.
    return { done: true, message: "No chapter summaries available to map into concepts." };
  }

  for (const chapterSummary of pending) {
    if (Date.now() - startedAt > timeBudgetMs) break;

    const sourceChunkIds = (chapterSummary.source_chunk_ids as string[]) || [];
    const { data: sourceChunks } = sourceChunkIds.length
      ? await supabase.from("content_chunks").select("document_id, page_start, page_end").in("id", sourceChunkIds)
      : { data: [] };

    const supportingPages = (sourceChunks || []).map((c) => ({
      documentId: c.document_id,
      pageStart: c.page_start,
      pageEnd: c.page_end,
    }));

    const breakdown = await extractConceptsFromChapterSummary({
      chapterTitle: chapterSummary.title || "Chapter",
      summary: {
        title: chapterSummary.title || "",
        summary: chapterSummary.summary_text,
        keyFacts: chapterSummary.key_facts || [],
        definitions: chapterSummary.definitions || [],
        formulas: chapterSummary.formulas || [],
        procedures: chapterSummary.procedures || [],
        dates: chapterSummary.dates || [],
        vocabulary: chapterSummary.vocabulary || [],
        examples: chapterSummary.examples || [],
        exceptions: chapterSummary.exceptions || [],
        relationships: chapterSummary.relationships || [],
        misconceptions: chapterSummary.misconceptions || [],
        learningObjectives: chapterSummary.learning_objectives || [],
      },
    });

    const { data: chapterConcept, error: chapterInsertError } = await supabase
      .from("concepts")
      .insert({
        course_id: job.course_id,
        concept_level: "chapter",
        name: chapterSummary.title || "Chapter",
        description: breakdown.chapterDescription,
        importance: breakdown.chapterImportance,
        supporting_pages: supportingPages,
      })
      .select("id")
      .single();

    if (chapterInsertError || !chapterConcept) {
      console.error(`Failed to insert chapter concept for summary ${chapterSummary.id}:`, chapterInsertError?.message);
      continue;
    }

    const nameToId = new Map<string, string>();
    for (const extracted of breakdown.concepts) {
      const { data: inserted, error: insertError } = await supabase
        .from("concepts")
        .insert({
          course_id: job.course_id,
          parent_concept_id: chapterConcept.id,
          concept_level: "concept",
          name: extracted.name,
          description: extracted.description,
          importance: extracted.importance,
          difficulty: extracted.difficulty,
          common_mistakes: extracted.commonMistakes,
          estimated_learning_minutes: extracted.estimatedLearningMinutes,
          supporting_pages: supportingPages,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error(`Failed to insert concept "${extracted.name}":`, insertError?.message);
        continue;
      }
      nameToId.set(extracted.name, inserted.id);
    }

    // Resolve prerequisite/related names to real concept ids -- skip
    // anything that didn't resolve rather than guessing at a match.
    const relationshipRows: { concept_id: string; related_concept_id: string; relationship_type: string }[] = [];
    for (const extracted of breakdown.concepts) {
      const conceptId = nameToId.get(extracted.name);
      if (!conceptId) continue;

      for (const prereqName of extracted.prerequisiteNames) {
        const prereqId = nameToId.get(prereqName);
        if (prereqId && prereqId !== conceptId) {
          relationshipRows.push({ concept_id: conceptId, related_concept_id: prereqId, relationship_type: "prerequisite" });
        }
      }
      for (const relatedName of extracted.relatedConceptNames) {
        const relatedId = nameToId.get(relatedName);
        if (relatedId && relatedId !== conceptId) {
          relationshipRows.push({ concept_id: conceptId, related_concept_id: relatedId, relationship_type: "related" });
        }
      }
    }

    if (relationshipRows.length > 0) {
      await supabase.from("concept_relationships").upsert(relationshipRows, {
        onConflict: "concept_id,related_concept_id,relationship_type",
        ignoreDuplicates: true,
      });
    }

    processedIds.add(chapterSummary.id);
  }

  const totalChapters = chapterSummaries?.length || 0;
  if (processedIds.size < totalChapters) {
    return {
      done: false,
      payload: { processedChapterSummaryIds: Array.from(processedIds) },
      message: `Mapped concepts for ${processedIds.size}/${totalChapters} chapters.`,
    };
  }

  // Next pipeline stage (Section 6) -- dormant until its handler exists.
  await enqueueJob({ courseId: job.course_id, jobType: "coverage_planning" });

  return { done: true, message: `Concept mapping complete: ${totalChapters} chapter(s) processed.` };
};
