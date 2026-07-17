// Lightweight duplicate/near-duplicate detector for marketing drafts --
// warns before publishing near-identical content across destinations. No
// external dependency: Jaccard similarity over lowercased word shingles,
// which is more than enough to catch "basically the same post" without
// needing an embeddings call for every comparison.

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
}

export function textSimilarity(a: string, b: string): number {
  const setA = tokenize(a || "");
  const setB = tokenize(b || "");
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionSize += 1;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// 0.6+ Jaccard overlap on a real marketing post reliably means "this reads
// as the same post," not a coincidental topic overlap -- calibrated
// generously toward fewer false positives since this only ever produces a
// warning, never blocks approval outright.
export const SIMILARITY_WARNING_THRESHOLD = 0.6;

export function findMostSimilarDraft(
  candidateBody: string,
  existingDrafts: { id: string; body: string | null }[]
): { draftId: string; score: number } | null {
  let best: { draftId: string; score: number } | null = null;

  for (const draft of existingDrafts) {
    if (!draft.body) continue;
    const score = textSimilarity(candidateBody, draft.body);
    if (!best || score > best.score) {
      best = { draftId: draft.id, score };
    }
  }

  return best;
}
