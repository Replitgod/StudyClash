import { describe, expect, it } from "vitest";
import { findQualityFlaws, keyPositionBias } from "./questionQuality";

function q(over: Partial<Parameters<typeof findQualityFlaws>[0]> = {}) {
  return {
    section: "reading_writing",
    question_type: "multiple_choice",
    question_text: "Which finding most directly supports the researchers' conclusion?",
    stimulus: "Researchers tracked turtles along a coastal route for three years.",
    answer_choices: [
      { id: "A", text: "Turtles avoided busy areas even where food was plentiful." },
      { id: "B", text: "Turtles were tracked along the route for three whole years." },
      { id: "C", text: "Forty turtles were tagged, enough to average out variation." },
      { id: "D", text: "Turtles moved through quiet areas that held little food." },
    ],
    correct_answer: "A",
    ...over,
  };
}

const codes = (input: Parameters<typeof findQualityFlaws>[0]) =>
  findQualityFlaws(input).map((f) => f.code);

describe("a well-built question", () => {
  it("trips nothing", () => {
    expect(findQualityFlaws(q())).toEqual([]);
  });
});

// The single most exploited flaw in multiple choice: a writer qualifies the
// true option carefully and leaves the false ones blunt, so picking the
// longest option beats guessing.
describe("the key being the longest option", () => {
  it("is flagged when the key dwarfs every distractor", () => {
    expect(
      codes(
        q({
          answer_choices: [
            { id: "A", text: "Turtles avoided high-traffic areas even where food was abundant, which isolates noise from scarcity." },
            { id: "B", text: "Three years." },
            { id: "C", text: "Forty turtles." },
            { id: "D", text: "One route." },
          ],
        })
      )
    ).toContain("longest_answer_is_key");
  });

  it("is not flagged when the options are comparable", () => {
    expect(codes(q())).not.toContain("longest_answer_is_key");
  });
});

describe("absolutes in distractors", () => {
  it("flags a sweeping generalization nobody would pick", () => {
    expect(
      codes(
        q({
          answer_choices: [
            { id: "A", text: "Turtles avoided busy areas even where food was plentiful." },
            { id: "B", text: "Researchers never revisit their own assumptions." },
            { id: "C", text: "Turtles moved through quiet areas that held little food." },
            { id: "D", text: "Forty turtles were tagged along the route." },
          ],
        })
      )
    ).toContain("absolute_term_in_distractor");
  });

  // "at all" is an intensifier and "all four side rails" is a quantity.
  // The first version flagged both, which flagged half the NCLEX bank for
  // describing real interventions.
  it("does not flag an absolute that is part of an ordinary phrase", () => {
    for (const text of [
      "Staff reported that patrons seemed less anxious about visiting at all.",
      "Keeping all four side rails raised while the client sleeps.",
      "Standard precautions only until culture results return.",
    ]) {
      expect(
        codes(
          q({
            answer_choices: [
              { id: "A", text: "Turtles avoided busy areas even where food was plentiful." },
              { id: "B", text },
              { id: "C", text: "Turtles moved through quiet areas that held little food." },
              { id: "D", text: "Forty turtles were tagged along the route." },
            ],
          })
        )
      ).not.toContain("absolute_term_in_distractor");
    }
  });
});

describe("a stem word echoed only in the key", () => {
  it("is flagged when the word appears nowhere else", () => {
    expect(
      codes(
        q({
          stimulus: null,
          question_text: "Which choice describes the bioluminescent display?",
          answer_choices: [
            { id: "A", text: "A bioluminescent glow along the shoreline." },
            { id: "B", text: "A loud noise from the harbour." },
            { id: "C", text: "A sudden drop in water temperature." },
            { id: "D", text: "A change in the tide." },
          ],
          correct_answer: "A",
        })
      )
    ).toContain("stem_word_echoed_in_key");
  });

  // On an evidence question the stem names the variables being controlled
  // for, and the right evidence has to mention them to BE the right
  // evidence. Flagging that punishes the question type for working.
  it("is not flagged when the word is passage vocabulary", () => {
    expect(
      codes(
        q({
          question_text: "Which finding supports the idea that the plaza, not income, drove the rise?",
          stimulus: "A planner compared two neighborhoods with nearly identical income levels.",
          answer_choices: [
            { id: "A", text: "The neighborhoods matched on income, yet only the plaza one gained." },
            { id: "B", text: "Both neighborhoods were tracked over two years." },
            { id: "C", text: "Revenue can be measured to the nearest dollar." },
            { id: "D", text: "The plaza opened in the spring of the first year." },
          ],
          correct_answer: "A",
        })
      )
    ).not.toContain("stem_word_echoed_in_key");
  });
});

describe("a stem too short to reason about", () => {
  it("is flagged outside mathematics", () => {
    expect(
      codes(q({ stimulus: null, question_text: "What is osmosis?", section: "reading_writing" }))
    ).toContain("stem_too_short");
  });

  // "If 3x + 7 = 22, what is x?" is exactly what the real exam asks, and the
  // reasoning lives in the algebra rather than the wording. Applying the rule
  // here would only mean padding stems to satisfy a checker.
  it("is not flagged in a math section", () => {
    expect(
      codes(q({ stimulus: null, question_text: "What is the value of 2^3 * 2^2?", section: "math" }))
    ).not.toContain("stem_too_short");

    expect(
      codes(q({ stimulus: null, question_text: "If 4x = 20, what is x?", section: "quant" }))
    ).not.toContain("stem_too_short");
  });
});

describe("keyPositionBias", () => {
  // A bank where 67 percent of keys are B rewards guessing B, and every
  // student eventually notices.
  it("reports the share sitting on the commonest position", () => {
    const bias = keyPositionBias([
      { correct_answer: "B" }, { correct_answer: "B" },
      { correct_answer: "B" }, { correct_answer: "A" },
    ]);
    expect(bias.total).toBe(4);
    expect(bias.worst).toBe("B");
    expect(bias.share).toBe(0.75);
  });

  it("ignores question types that have no single position", () => {
    const bias = keyPositionBias([
      { correct_answer: "A,C", question_type: "multiple_response" },
      { correct_answer: "6", question_type: "student_produced_response" },
      { correct_answer: "A" },
    ]);
    expect(bias.total).toBe(1);
  });

  it("reports nothing rather than dividing by zero on an empty bank", () => {
    expect(keyPositionBias([]).share).toBe(0);
  });
});
