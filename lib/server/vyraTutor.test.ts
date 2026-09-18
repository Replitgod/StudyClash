import { describe, expect, it } from "vitest";
import {
  buildTutorInstructions,
  extractPracticeMarker,
  normalizeCoachAction,
  tidyTutorReply,
} from "./vyraTutor";
import { daysUntil, EMPTY_LEARNER, formatLearnerContext } from "./learnerContext";

describe("tidyTutorReply", () => {
  // The old route replaced any reply without its four headings with filler.
  // A guiding question is the most valuable thing a tutor says; it must
  // survive untouched.
  it("keeps a Socratic reply exactly as written", () => {
    const reply = "Before I explain: what do you think happens to the pressure if the volume halves?";
    expect(tidyTutorReply(reply)).toBe(reply);
  });

  it("strips markdown the chat does not render", () => {
    expect(tidyTutorReply("**Key idea**\n## Heading\n* point\n`code`")).toBe("Key idea\nHeading\n- point\ncode");
  });
});

describe("extractPracticeMarker", () => {
  it("turns the marker line into a topic and removes it from the reply", () => {
    const { cleanedText, topic } = extractPracticeMarker(
      "You keep mixing up mitosis and meiosis.\n\nPRACTICE_SET: Mitosis vs meiosis"
    );
    expect(topic).toBe("Mitosis vs meiosis");
    expect(cleanedText).toBe("You keep mixing up mitosis and meiosis.");
  });

  it("leaves a reply without a marker alone", () => {
    expect(extractPracticeMarker("Just an answer.")).toEqual({ cleanedText: "Just an answer.", topic: null });
  });
});

describe("buildTutorInstructions", () => {
  it("asks for hints before answers and forbids repeating an explanation", () => {
    const text = buildTutorInstructions({
      action: "ask",
      educationLevel: null,
      canCreatePlan: false,
      resourceSearchRunning: false,
    });
    expect(text).toMatch(/smallest useful hint/);
    expect(text).toMatch(/do not repeat your explanation/i);
    expect(text).not.toMatch(/Quick answer/);
  });

  it("only offers plan markers when a plan can really be saved", () => {
    const base = { action: "study_plan" as const, educationLevel: null, resourceSearchRunning: false };
    expect(buildTutorInstructions({ ...base, canCreatePlan: true })).toMatch(/PLAN_DUE_DATE/);
    expect(buildTutorInstructions({ ...base, canCreatePlan: false })).not.toMatch(/PLAN_DUE_DATE/);
  });

  it("pitches to the student's level when known", () => {
    expect(
      buildTutorInstructions({
        action: "ask",
        educationLevel: "9th grade",
        canCreatePlan: false,
        resourceSearchRunning: false,
      })
    ).toMatch(/9th grade/);
  });

  it("normalizes unknown actions to a plain question", () => {
    expect(normalizeCoachAction("drop_tables")).toBe("ask");
    expect(normalizeCoachAction("quiz_me")).toBe("quiz_me");
  });
});

describe("formatLearnerContext", () => {
  const NOW = Date.parse("2026-09-18T12:00:00");

  it("says plainly when nothing is known, instead of listing empty sections", () => {
    expect(formatLearnerContext(EMPTY_LEARNER, NOW)).toBe(
      "Nothing is known about this student's progress yet."
    );
  });

  it("names weak topics, confident misses and the exam countdown", () => {
    const text = formatLearnerContext(
      {
        ...EMPTY_LEARNER,
        targetExam: "Digital SAT",
        examDate: "2026-10-03",
        weakTopics: [{ topic: "Linear equations", deckTitle: "SAT Math", mastery: 41, confidentMisses: 2 }],
        recentMistakes: [
          { topic: "Linear equations", question: "Solve 2x+3=9", chosen: "6", correct: "3", wasSure: true },
        ],
      },
      NOW
    );
    expect(text).toMatch(/Digital SAT \(in 15 days, on 2026-10-03\)/);
    expect(text).toMatch(/Linear equations \(SAT Math\): 41, 2 confident wrong answers/);
    expect(text).toMatch(/and were sure/);
  });

  it("works out days until an exam, and ignores past or malformed dates", () => {
    expect(daysUntil("2026-09-18", NOW)).toBe(0);
    expect(daysUntil("2026-09-25", NOW)).toBe(7);
    expect(daysUntil("2026-09-01", NOW)).toBeNull();
    expect(daysUntil("next week", NOW)).toBeNull();
  });
});
