import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { chunkDocumentPages, type PageForChunking } from "@/lib/server/curriculum/chunking";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

// Pure in-memory computation (no network calls) reading document_pages and
// writing content_chunks -- fast even for a 1,200-page document, so unlike
// ingestion's OCR phase this always completes in a single invocation
// rather than needing batched resumability.
export const runChunkingJob: JobHandler = async (job) => {
  if (!job.document_id) {
    throw new Error("chunking job is missing document_id.");
  }

  const supabase = getServiceSupabaseClient();

  const { data: pageRows, error: pagesError } = await supabase
    .from("document_pages")
    .select("page_number, raw_text, structure, extraction_confidence, is_unreadable")
    .eq("document_id", job.document_id)
    .order("page_number", { ascending: true });

  if (pagesError) {
    throw new Error(`Failed to load document_pages: ${pagesError.message}`);
  }

  const pages: PageForChunking[] = (pageRows || []).map((row) => ({
    pageNumber: row.page_number,
    rawText: row.raw_text || "",
    structure: row.structure || {},
    extractionConfidence: row.extraction_confidence || 0,
    isUnreadable: row.is_unreadable,
  }));

  const chunks = chunkDocumentPages(pages);

  // Idempotent re-chunking (e.g. reprocessing after a parser improvement,
  // Section 14): clear this document's existing chunks first rather than
  // accumulating duplicates. chunk_embeddings cascades on delete.
  await supabase.from("content_chunks").delete().eq("document_id", job.document_id);

  if (chunks.length > 0) {
    const { error: insertError } = await supabase.from("content_chunks").insert(
      chunks.map((chunk) => ({
        course_id: job.course_id,
        document_id: job.document_id,
        chunk_index: chunk.chunkIndex,
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        chapter: chunk.chapter,
        section: chunk.section,
        heading: chunk.heading,
        chunk_type: chunk.chunkType,
        content: chunk.content,
        extraction_confidence: chunk.extractionConfidence,
      }))
    );

    if (insertError) {
      throw new Error(`Failed to insert content_chunks: ${insertError.message}`);
    }
  }

  await enqueueJob({ courseId: job.course_id, documentId: job.document_id, jobType: "indexing" });

  return { done: true, message: `Chunked into ${chunks.length} chunk(s).` };
};
