// Shared between the server route (app/api/vyra-chat/route.ts) and the
// client component (app/components/VyraCoach.tsx) that streams VYRA's chat
// replies token-by-token. Plain data only, no server-only imports, so it's
// safe for a "use client" file to import.

export type StreamedResourceRecommendation = {
  title: string;
  source: string;
  url: string;
  whyChosen: string;
  estimatedStudyTime: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "mixed";
  resourceType: string;
  trustTier: "official" | "reputable" | "community";
};

// Separates the live token stream from the trailing JSON metadata chunk
// (the finalized, post-processed reply plus any grounded resources). VYRA's
// system prompt forbids symbols/markdown in replies (see rule 9 in
// vyra-chat/route.ts), so this marker will not occur in real model output.
export const VYRA_STREAM_META_DELIMITER = "\nSSVYRA_STREAM_METASS\n";

// Tool actions VYRA can actually perform instead of just describing --
// the server does the real work (resolves weak topics, creates a study
// plan row) and hands back a link to the real result, which the client
// renders as a clickable action rather than inert chat text.
export type VyraBattleAction = {
  deckId: string;
  topics: string[];
};

export type VyraStudyPlanAction = {
  planId: string;
  assessmentName: string;
  dueDate: string;
};

export type VyraStreamMeta = {
  finalReply: string;
  resources?: StreamedResourceRecommendation[];
  resourcesDisclaimer?: string;
  battleAction?: VyraBattleAction;
  studyPlanAction?: VyraStudyPlanAction;
};

// Local-reply paths (mistake_mode/hint_mode with a known missed question)
// and the offline fallback still return plain JSON instead of a stream --
// this header is how the client tells the two apart without sniffing body
// content.
export const VYRA_STREAM_HEADER = "X-Vyra-Stream";
