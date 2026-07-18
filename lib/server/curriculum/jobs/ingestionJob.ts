import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { downloadDocumentFile } from "@/lib/server/curriculum/storage";
import {
  extractImagePage,
  extractPdfNativeTextPass,
  extractTextFilePage,
  ocrPdfPagesBatch,
  type ExtractedPage,
} from "@/lib/server/curriculum/extraction";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

// How many OCR pages (real vision API calls) to process per invocation --
// bounded so one invocation can't run past the serverless time limit on a
// heavily-scanned document. The rest resume on the next chained call.
const OCR_BATCH_SIZE = 12;

type IngestionPayload = {
  storagePath: string;
  sourceType: string;
  mimeType: string | null;
  phase?: "native_text" | "ocr" | "done";
  pendingOcrPages?: number[];
  totalPages?: number;
};

function upsertPageRow(page: ExtractedPage, documentId: string) {
  return {
    document_id: documentId,
    page_number: page.pageNumber,
    raw_text: page.rawText || null,
    ocr_used: page.ocrUsed,
    extraction_confidence: page.extractionConfidence,
    is_unreadable: page.isUnreadable,
    structure: page.structure,
    processing_status: page.isUnreadable ? "needs_review" : "extracted",
    updated_at: new Date().toISOString(),
  };
}

async function finalizeDocument(documentId: string): Promise<void> {
  const supabase = getServiceSupabaseClient();
  const { data: pages } = await supabase
    .from("document_pages")
    .select("is_unreadable, extraction_confidence")
    .eq("document_id", documentId);

  const total = pages?.length || 0;
  const unreadable = (pages || []).filter((p) => p.is_unreadable).length;
  const avgConfidence = total
    ? (pages || []).reduce((sum, p) => sum + (p.extraction_confidence || 0), 0) / total
    : 0;

  // A document where every page failed extraction is a real failure, not a
  // "ready with 0% coverage" success -- surfaced distinctly so the upload
  // UI can tell the student to try a different file.
  const status = total > 0 && unreadable === total ? "failed" : "ready";

  await supabase
    .from("documents")
    .update({
      processing_status: status,
      page_count: total,
      extraction_confidence: avgConfidence,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  // Advance the pipeline: a successfully ingested document immediately
  // gets a chunking job queued behind it (Section 9's Upload -> Extract ->
  // ... -> Chunk chain). Chunking is per-document, not per-course, so it
  // doesn't need to wait for sibling documents.
  if (status === "ready") {
    const { data: document } = await supabase.from("documents").select("course_id").eq("id", documentId).single();
    if (document) {
      await enqueueJob({ courseId: document.course_id, documentId, jobType: "chunking" });
    }
  }
}

export const runIngestionJob: JobHandler = async (job, timeBudgetMs) => {
  if (!job.document_id) {
    throw new Error("document_ingestion job is missing document_id.");
  }

  const startedAt = Date.now();
  const supabase = getServiceSupabaseClient();
  const payload = job.payload as IngestionPayload;

  await supabase
    .from("documents")
    .update({ processing_status: "extracting", updated_at: new Date().toISOString() })
    .eq("id", job.document_id);

  const fileBuffer = await downloadDocumentFile(payload.storagePath);

  if (payload.sourceType === "image") {
    const pages = await extractImagePage(fileBuffer, payload.mimeType || "image/jpeg");
    await supabase.from("document_pages").upsert(
      pages.map((p) => upsertPageRow(p, job.document_id as string)),
      { onConflict: "document_id,page_number" }
    );
    await finalizeDocument(job.document_id);
    return { done: true, message: "Image document ingested." };
  }

  if (payload.sourceType === "text_file") {
    const pages = extractTextFilePage(fileBuffer);
    await supabase.from("document_pages").upsert(
      pages.map((p) => upsertPageRow(p, job.document_id as string)),
      { onConflict: "document_id,page_number" }
    );
    await finalizeDocument(job.document_id);
    return { done: true, message: "Text file ingested." };
  }

  if (payload.sourceType === "pdf" && !payload.phase) {
    const { totalPages, pages, pagesNeedingOcr } = await extractPdfNativeTextPass(fileBuffer);
    await supabase.from("document_pages").upsert(
      pages.map((p) => upsertPageRow(p, job.document_id as string)),
      { onConflict: "document_id,page_number" }
    );

    const nextPayload: IngestionPayload = {
      ...payload,
      totalPages,
      pendingOcrPages: pagesNeedingOcr,
      phase: pagesNeedingOcr.length > 0 ? "ocr" : "done",
    };

    if (nextPayload.phase === "done") {
      await finalizeDocument(job.document_id);
      return { done: true, message: "PDF ingested (no OCR needed).", payload: nextPayload };
    }

    return {
      done: false,
      payload: nextPayload,
      message: `Native text pass complete, ${pagesNeedingOcr.length} page(s) queued for OCR.`,
    };
  }

  if (payload.sourceType === "pdf" && payload.phase === "ocr") {
    const pending = payload.pendingOcrPages || [];
    const batch: number[] = [];

    for (const pageNumber of pending) {
      if (batch.length >= OCR_BATCH_SIZE) break;
      if (Date.now() - startedAt > timeBudgetMs) break;
      batch.push(pageNumber);
    }

    const results = await ocrPdfPagesBatch(fileBuffer, batch);
    await supabase.from("document_pages").upsert(
      results.map((p) => upsertPageRow(p, job.document_id as string)),
      { onConflict: "document_id,page_number" }
    );

    const remaining = pending.filter((p) => !batch.includes(p));
    const nextPayload: IngestionPayload = { ...payload, pendingOcrPages: remaining };

    if (remaining.length === 0) {
      await finalizeDocument(job.document_id);
      return { done: true, message: "PDF OCR complete.", payload: { ...nextPayload, phase: "done" } };
    }

    return {
      done: false,
      payload: nextPayload,
      message: `OCR batch complete: ${batch.length} page(s) done, ${remaining.length} remaining.`,
    };
  }

  throw new Error(`Unrecognized ingestion state: sourceType=${payload.sourceType}, phase=${payload.phase}`);
};
