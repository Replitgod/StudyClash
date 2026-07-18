import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Must match chunk_embeddings.embedding's vector(1536) column dimension
// (supabase/migrations/20260725_curriculum_engine_schema_phase1.sql) --
// changing this model requires changing that column's dimension too.
export const EMBEDDING_MODEL = "text-embedding-3-small";

// One request embeds many chunks at once (OpenAI's embeddings endpoint
// accepts an array input) -- this is the embedding-side equivalent of
// "never place thousands of pages into one AI prompt": batched, not one
// network round-trip per chunk, but still bounded per call.
const EMBEDDING_BATCH_SIZE = 64;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    for (const item of response.data) {
      results.push(item.embedding);
    }
  }

  return results;
}
