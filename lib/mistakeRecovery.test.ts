import { describe, expect, it } from "vitest";
import {
  recoveryCredit,
  similarity,
  validateFollowUp,
  MAX_FOLLOW_UP_SIMILARITY,
} from "@/lib/mistakeRecovery";
import { RECOVERY_XP } from "@/lib/cardCrack";

const ORIGINAL = {
  questionText: "Which reagent reduces a ketone to a secondary alcohol?",
  correctAnswer: "NaBH4",
};

function followUp(overrides: Record<string, unknown> = {}) {
  return {
    questionText: "A student needs to convert cyclohexanone into cyclohexanol. Which choice works?",
    choices: ["NaBH4 in methanol", "PCC in DCM", "KMnO4, hot", "SOCl2"],
    correctAnswer: "NaBH4 in methanol",
    explanation: "Hydride donors reduce the carbonyl; PCC and KMnO4 oxidise.",
    ...overrides,
  };
}

describe("similarity", () => {
  it("scores identical text at 1 and unrelated text near 0", () => {
    expect(similarity("the mitochondria is the powerhouse", "the mitochondria is the powerhouse")).toBe(1);
    expect(similarity("photosynthesis in plants", "roman senate procedure")).toBeLessThan(0.1);
  });

  it("ignores punctuation and case", () => {
    expect(similarity("What is Ohm's Law?", "what is ohms law")).toBe(1);
  });

  it("returns 0 rather than dividing by zero on empty input", () => {
    expect(similarity("", "anything")).toBe(0);
    expect(similarity("", "")).toBe(0);
  });
});

describe("validateFollowUp", () => {
  it("accepts a well-formed question", () => {
    const result = validateFollowUp(followUp(), ORIGINAL);
    expect(result).not.toBeNull();
    expect(result?.choices).toHaveLength(4);
    expect(result?.correctAnswer).toBe("NaBH4 in methanol");
  });

  it("rejects a question whose answer is not among its own choices", () => {
    // The failure that makes a question literally unanswerable.
    expect(
      validateFollowUp(followUp({ correctAnswer: "LiAlH4" }), ORIGINAL)
    ).toBeNull();
  });

  it("repairs a duplicated correct answer instead of discarding the question", () => {
    // Two identical choices would give the student a question with two
    // right answers. Collapsing them leaves a valid question, which serves
    // the student better than throwing the whole thing away.
    const result = validateFollowUp(
      followUp({ choices: ["NaBH4", "NaBH4", "PCC"], correctAnswer: "NaBH4" }),
      ORIGINAL
    );
    expect(result?.choices).toEqual(["NaBH4", "PCC"]);
    expect(result?.correctAnswer).toBe("NaBH4");
  });

  it("rejects a question whose answer is ambiguous after de-duplication", () => {
    // Nothing left to disambiguate against: every choice is the answer.
    expect(
      validateFollowUp(
        followUp({ choices: ["NaBH4", "nabh4", "NABH4"], correctAnswer: "NaBH4" }),
        ORIGINAL
      )
    ).toBeNull();
  });

  it("de-duplicates choices that differ only by case or spacing", () => {
    const result = validateFollowUp(
      followUp({
        choices: ["NaBH4 in methanol", "nabh4  in  methanol", "PCC in DCM", "SOCl2"],
        correctAnswer: "NaBH4 in methanol",
      }),
      ORIGINAL
    );
    expect(result?.choices).toHaveLength(3);
  });

  it("rejects a follow-up that is really the original question again", () => {
    expect(
      validateFollowUp(
        followUp({ questionText: ORIGINAL.questionText }),
        ORIGINAL
      )
    ).toBeNull();
  });

  it("allows a genuinely different question on the same idea", () => {
    const result = validateFollowUp(followUp(), ORIGINAL);
    expect(
      similarity(result?.questionText ?? "", ORIGINAL.questionText)
    ).toBeLessThanOrEqual(MAX_FOLLOW_UP_SIMILARITY);
  });

  it("rejects a question with fewer than two usable choices", () => {
    expect(
      validateFollowUp(followUp({ choices: ["NaBH4 in methanol"] }), ORIGINAL)
    ).toBeNull();
    expect(
      validateFollowUp(followUp({ choices: ["", "   ", null] }), ORIGINAL)
    ).toBeNull();
  });

  it("rejects a stub question", () => {
    expect(validateFollowUp(followUp({ questionText: "Why?" }), ORIGINAL)).toBeNull();
  });

  it("rejects garbage rather than throwing", () => {
    for (const junk of [null, undefined, "a string", 42, [], { choices: "nope" }]) {
      expect(validateFollowUp(junk, ORIGINAL)).toBeNull();
    }
  });

  it("caps the number of choices it will show", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Distinct option ${i}`);
    const result = validateFollowUp(
      followUp({ choices: many, correctAnswer: "Distinct option 0" }),
      ORIGINAL
    );
    expect(result?.choices.length).toBeLessThanOrEqual(6);
  });

  it("returns the choice-list copy of the answer so comparison is exact", () => {
    const result = validateFollowUp(
      followUp({ correctAnswer: "  NaBH4 in methanol  " }),
      ORIGINAL
    );
    expect(result?.choices).toContain(result?.correctAnswer);
  });
});

describe("recoveryCredit", () => {
  it("pays the brief's +30 for a recovery, from one constant", () => {
    expect(recoveryCredit("recovered").xp).toBe(RECOVERY_XP);
    expect(RECOVERY_XP).toBe(30);
  });

  it("pays most for an actual recovery", () => {
    expect(recoveryCredit("recovered").recoveries).toBe(1);
    expect(recoveryCredit("recovered").xp).toBeGreaterThan(
      recoveryCredit("still_wrong").xp
    );
  });

  it("pays something for trying and nothing for skipping", () => {
    expect(recoveryCredit("still_wrong").xp).toBeGreaterThan(0);
    expect(recoveryCredit("still_wrong").recoveries).toBe(0);
    expect(recoveryCredit("skipped").xp).toBe(0);
  });
});
