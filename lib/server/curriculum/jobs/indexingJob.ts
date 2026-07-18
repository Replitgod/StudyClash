import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { embedTexts, EMBEDDING_MODEL } from "@/lib/server/curriculum/embeddings";
import { enqueueJob } from "@/lib/server/curriculum/enqueue";
import type { JobHandler } from "./types";

// Bounded per invocation (real OpenAI API calls, unlike chunking) --
// re-queries "chunks still missing an embedding row" fresh on every call
// instead of tracking an explicit cursor in payload, so it's naturally
// resumable and immune to a chunk list changing between invocations
// (e.g. a re-chunk happening concurrently).
const CHUNKS_PER_INVOCATION = 200;

export const runIndexingJob: JobHandler = async (job) => {
  if (!job.document_id) {
    throw new Error("indexing job is missing document_id.");
  }

  const supabase = getServiceSupabaseClient();

  const { data: allChunks, error: chunksError } = await supabase
    .from("content_chunks")
    .select("id, content")
    .eq("document_id", job.document_id);

  if (chunksError) {
    throw new Error(`Failed to load content_chunks: ${chunksError.message}`);
  }

  const chunkIds = (allChunks || []).map((c) => c.id);
  if (chunkIds.length === 0) {
    return { done: true, message: "No chunks to index." };
  }

  const { data: existingEmbeddings, error: embeddingsError } = await supabase
    .from("chunk_embeddings")
    .select("chunk_id")
    .eq("embedding_model", EMBEDDING_MODEL)
    .in("chunk_id", chunkIds);

  if (embeddingsError) {
    throw new Error(`Failed to check existing embeddings: ${embeddingsError.message}`);
  }

  const alreadyIndexed = new Set((existingEmbeddings || []).map((e) => e.chunk_id));
  const pending = (allChunks || []).filter((c) => !alreadyIndexed.has(c.id)).slice(0, CHUNKS_PER_INVOCATION);

  if (pending.length === 0) {
    return { done: true, message: "All chunks already indexed." };
  }

  const embeddings = await embedTexts(pending.map((c) => c.content));

  const { error: insertError } = await supabase.from("chunk_embeddings").insert(
    pending.map((chunk, i) => ({
      chunk_id: chunk.id,
      embedding_model: EMBEDDING_MODEL,
      embedding: embeddings[i],
    }))
  );

  if (insertError) {
    throw new Error(`Failed to insert chunk_embeddings: ${insertError.message}`);
  }

  const remainingAfterThisBatch = chunkIds.length - alreadyIndexed.size - pending.length;
  if (remainingAfterThisBatch > 0) {
    return { done: false, payload: job.payload, message: `Indexed ${pending.length} chunk(s), ${remainingAfterThisBatch} remaining.` };
  }

  await enqueueJob({
    courseId: job.course_id,
    documentId: job.document_id,
    jobType: "summarization",
    payload: { scope: "document" },
  });

  return { done: true, message: `Indexed ${pending.length} chunk(s). Document fully indexed.` };
};
