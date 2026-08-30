import { describe, expect, it } from "vitest";
import { buildAceSystemPrompt, type AceCapability } from "./aceIntelligence";

const capabilities: AceCapability[] = [
  "source_extraction",
  "source_synthesis",
  "concept_map",
  "question",
  "verify_question",
  "grade",
  "card_crack",
  "diagnose",
  "teach",
  "coach",
  "session_summary",
];

describe("buildAceSystemPrompt", () => {
  it.each(capabilities)("composes the shared contract for %s", (capability) => {
    const prompt = buildAceSystemPrompt({ capability, knowledgeMode: "source_locked" });
    expect(prompt).toContain("durable, transferable learning gain per minute");
    expect(prompt).toContain("KNOWLEDGE MODE: SOURCE-LOCKED");
    expect(prompt).toContain("Obey the calling route's output schema exactly");
    expect(prompt).not.toContain("undefined");
  });

  it("keeps source-locked work grounded and receipt-aware", () => {
    const prompt = buildAceSystemPrompt({ capability: "question", knowledgeMode: "source_locked" });
    expect(prompt).toContain("Do not silently add outside facts");
    expect(prompt).toContain("Never fabricate a receipt");
    expect(prompt).toContain("silently check source validity");
  });

  it("labels the knowledge boundary in mixed coaching", () => {
    const prompt = buildAceSystemPrompt({ capability: "coach", knowledgeMode: "mixed" });
    expect(prompt).toContain("WITH AN EXPLICIT BOUNDARY");
    expect(prompt).toContain("recommend exactly one primary action");
  });

  it("does not let Card Crack overclaim a student's thinking", () => {
    const prompt = buildAceSystemPrompt({ capability: "card_crack", knowledgeMode: "source_locked" });
    expect(prompt).toContain('"you may be treating"');
    expect(prompt).toContain("is not mastery");
  });

  it("adds the short spoken-response contract only in voice mode", () => {
    const normal = buildAceSystemPrompt({ capability: "teach", knowledgeMode: "topic" });
    const voice = buildAceSystemPrompt({ capability: "teach", knowledgeMode: "topic", voice: true });
    expect(normal).not.toContain("VOICE MODE");
    expect(voice).toContain("one to three spoken sentences");
  });
});
