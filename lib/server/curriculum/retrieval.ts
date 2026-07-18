import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { embedTexts } from "./embeddings";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  content: string;
  chapter: string | null;
  section: string | null;
  topic: string | null;
  subtopic: string | null;
  pageStart: number;
  pageEnd: number;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
};

// The one retrieval entry point every downstream stage (summarization,
// concept mapping, question generation, the AI tutor) should call rather
// than querying content_chunks/chunk_embeddings directly -- keeps the
// hybrid-search SQL (match_content_chunks, see
// 20260726_curriculum_hybrid_retrieval.sql) as the single implementation.
export async function hybridRetrieve(args: {
  courseId: string;
  queryText: string;
  documentId?: string;
  chapter?: string;
  matchCount?: number;
}): Promise<RetrievedChunk[]> {
  const supabase = getServiceSupabaseClient();
  const [queryEmbedding] = await embedTexts([args.queryText]);

  const { data, error } = await supabase.rpc("match_content_chunks", {
    query_embedding: queryEmbedding,
    query_text: args.queryText,
    filter_course_id: args.courseId,
    filter_document_id: args.documentId ?? null,
    filter_chapter: args.chapter ?? null,
    match_count: args.matchCount ?? 10,
  });

  if (error) {
    throw new Error(`Hybrid retrieval failed: ${error.message}`);
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    chunkId: row.chunk_id as string,
    documentId: row.document_id as string,
    content: row.content as string,
    chapter: row.chapter as string | null,
    section: row.section as string | null,
    topic: row.topic as string | null,
    subtopic: row.subtopic as string | null,
    pageStart: row.page_start as number,
    pageEnd: row.page_end as number,
    semanticScore: row.semantic_score as number,
    keywordScore: row.keyword_score as number,
    combinedScore: row.combined_score as number,
  }));
}

export async function exactPhraseSearch(args: {
  courseId: string;
  queryText: string;
  documentId?: string;
  matchCount?: number;
}): Promise<Pick<RetrievedChunk, "chunkId" | "documentId" | "content" | "chapter" | "section" | "pageStart" | "pageEnd">[]> {
  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase.rpc("search_content_chunks_exact_phrase", {
    query_text: args.queryText,
    filter_course_id: args.courseId,
    filter_document_id: args.documentId ?? null,
    match_count: args.matchCount ?? 10,
  });

  if (error) {
    throw new Error(`Exact-phrase search failed: ${error.message}`);
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    chunkId: row.chunk_id as string,
    documentId: row.document_id as string,
    content: row.content as string,
    chapter: row.chapter as string | null,
    section: row.section as string | null,
    pageStart: row.page_start as number,
    pageEnd: row.page_end as number,
  }));
}
