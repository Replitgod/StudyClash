import { describe, expect, it } from "vitest";
import {
  adaptDifficulty,
  difficultyBand,
  difficultyValue,
  INITIAL_ADAPTIVE_STATE,
  planSession,
  reorderRemaining,
  type AdaptiveState,
} from "@/lib/adaptiveSession";
import type { SessionQuestion } from "@/lib/studySession";

function q(
  id: string,
  topic: string,
  difficulty: string | null = "medium"
): SessionQuestion {
  return {
    id,
    question_text: `Question ${id}`,
    answer_choices: ["a", "b", "c", "d"],
    correct_answer: "a",
    explanation: null,
    topic,
    difficulty,
  };
}

describe("difficultyBand", () => {
  it("normalises the mixed vocabulary the generated data actually contains", () => {
    expect(difficultyBand("Medium")).toBe("medium");
    expect(difficultyBand("  HARD ")).toBe("hard");
    expect(difficultyBand("beginner")).toBe("easy");
    expect(difficultyBand("advanced")).toBe("hard");
  });

  it("treats anything unrecognised as medium, never as easy", () => {
    // Defaulting to easy would hand a struggling student a free win and
    // quietly corrupt the mastery signal.
    for (const junk of [null, undefined, "", "banana", "???"]) {
      expect(difficultyBand(junk)).toBe("medium");
    }
  });

  it("maps to the 0..1 scale the mastery model scores against", () => {
    expect(difficultyValue("easy")).toBe(0);
    expect(difficultyValue("medium")).toBe(0.5);
    expect(difficultyValue("hard")).toBe(1);
  });
});

describe("planSession", () => {
  const questions = [
    q("1", "Stoichiometry"),
    q("2", "Equilibrium"),
    q("3", "Kinetics"),
    q("4", "Thermodynamics"),
  ];

  it("puts questions from high-priority topics first", () => {
    const plan = planSession({
      questions,
      topics: [],
      limit: null,
      topicPriorities: [
        { topic: "kinetics", priority: 0.9, isDue: true },
        { topic: "stoichiometry", priority: 0.1, isDue: false },
      ],
    });
    expect(plan.questions[0].topic).toBe("Kinetics");
  });

  it("prioritises questions the student missed last time", () => {
    const plan = planSession({
      questions,
      topics: [],
      limit: 2,
      history: [
        { questionId: "4", correctStreak: 0, isDue: true },
        { questionId: "1", correctStreak: 5, isDue: false },
      ],
    });
    expect(plan.questions.map((x) => x.id)).toContain("4");
    // A question answered right five times running is not what a short
    // session should spend its slots on.
    expect(plan.questions.map((x) => x.id)).not.toContain("1");
  });

  it("selects by value rather than by database order when limiting", () => {
    // The regression this replaces: slice(0, limit) took the first N rows.
    const plan = planSession({
      questions,
      topics: [],
      limit: 1,
      topicPriorities: [{ topic: "thermodynamics", priority: 1, isDue: true }],
    });
    expect(plan.questions).toHaveLength(1);
    expect(plan.questions[0].topic).toBe("Thermodynamics");
  });

  it("opens with something winnable rather than the hardest question", () => {
    const plan = planSession({
      questions: [
        q("hard1", "Equilibrium", "hard"),
        q("hard2", "Equilibrium", "hard"),
        q("easy1", "Equilibrium", "easy"),
        q("hard3", "Equilibrium", "hard"),
      ],
      topics: [],
      limit: null,
    });
    expect(plan.questions[0].id).toBe("easy1");
  });

  it("still narrows to requested topics", () => {
    const plan = planSession({
      questions,
      topics: ["equilibrium"],
      limit: null,
    });
    expect(plan.questions).toHaveLength(1);
    expect(plan.questions[0].topic).toBe("Equilibrium");
    expect(plan.didFallBack).toBe(false);
  });

  it("matches a topic by partial overlap, not just exact equality", () => {
    // Topic labels drift between generations ("Kinetics" vs "Reaction
    // Kinetics"); an exact-match-only rule would silently return nothing.
    const plan = planSession({
      questions: [q("1", "Reaction Kinetics"), q("2", "Equilibrium")],
      topics: ["kinetics"],
      limit: null,
    });
    expect(plan.questions.map((x) => x.id)).toEqual(["1"]);
    expect(plan.didFallBack).toBe(false);
  });

  it("ignores a question with no topic when topics were requested", () => {
    const plan = planSession({
      questions: [q("1", ""), q("2", "Equilibrium")],
      topics: ["equilibrium"],
      limit: null,
    });
    expect(plan.questions.map((x) => x.id)).toEqual(["2"]);
  });

  it("falls back to the whole set when narrowing matches nothing", () => {
    const plan = planSession({
      questions,
      topics: ["a topic that no longer exists"],
      limit: null,
    });
    expect(plan.didFallBack).toBe(true);
    expect(plan.questions).toHaveLength(4);
  });

  it("handles an empty pool without throwing", () => {
    const plan = planSession({ questions: [], topics: [], limit: 10 });
    expect(plan.questions).toEqual([]);
    expect(plan.rationale).toBeTruthy();
  });

  it("is deterministic for the same inputs", () => {
    const args = {
      questions,
      topics: [],
      limit: 3,
      topicPriorities: [{ topic: "kinetics", priority: 0.5, isDue: false }],
    };
    expect(planSession(args).questions.map((x) => x.id)).toEqual(
      planSession(args).questions.map((x) => x.id)
    );
  });

  it("never returns more questions than asked for", () => {
    const plan = planSession({ questions, topics: [], limit: 2 });
    expect(plan.questions).toHaveLength(2);
  });

  it("explains what it did", () => {
    const plan = planSession({
      questions,
      topics: [],
      limit: 2,
      history: [{ questionId: "2", correctStreak: 0, isDue: true }],
    });
    expect(plan.rationale).toMatch(/missed/i);
  });
});

describe("adaptDifficulty", () => {
  it("steps up only after a run of correct answers", () => {
    let state = INITIAL_ADAPTIVE_STATE;
    state = adaptDifficulty(state, { isCorrect: true, topic: "T" });
    expect(state.target).toBe("medium");
    state = adaptDifficulty(state, { isCorrect: true, topic: "T" });
    expect(state.target).toBe("medium");
    state = adaptDifficulty(state, { isCorrect: true, topic: "T" });
    expect(state.target).toBe("hard");
  });

  it("steps down faster than it steps up", () => {
    // Being pushed too hard makes a student quit; being asked something a
    // little too easy costs seconds. The thresholds reflect that.
    let state: AdaptiveState = { ...INITIAL_ADAPTIVE_STATE, target: "hard" };
    state = adaptDifficulty(state, { isCorrect: false, topic: "T" });
    expect(state.target).toBe("hard");
    state = adaptDifficulty(state, { isCorrect: false, topic: "T" });
    expect(state.target).toBe("medium");
  });

  it("resets the streak on a miss", () => {
    let state = INITIAL_ADAPTIVE_STATE;
    state = adaptDifficulty(state, { isCorrect: true, topic: "T" });
    state = adaptDifficulty(state, { isCorrect: true, topic: "T" });
    state = adaptDifficulty(state, { isCorrect: false, topic: "T" });
    expect(state.streak).toBe(0);
    expect(state.missStreak).toBe(1);
  });

  it("never pushes past the ends of the scale", () => {
    let state: AdaptiveState = { ...INITIAL_ADAPTIVE_STATE, target: "hard" };
    for (let i = 0; i < 10; i += 1) {
      state = adaptDifficulty(state, { isCorrect: true, topic: "T" });
    }
    expect(state.target).toBe("hard");

    let low: AdaptiveState = { ...INITIAL_ADAPTIVE_STATE, target: "easy" };
    for (let i = 0; i < 10; i += 1) {
      low = adaptDifficulty(low, { isCorrect: false, topic: "T" });
    }
    expect(low.target).toBe("easy");
  });

  it("records a topic missed more than once as a genuine gap", () => {
    let state = INITIAL_ADAPTIVE_STATE;
    state = adaptDifficulty(state, { isCorrect: false, topic: "Equilibrium" });
    expect(state.strugglingTopics).toEqual([]);
    state = adaptDifficulty(state, { isCorrect: false, topic: "Equilibrium" });
    expect(state.strugglingTopics).toContain("equilibrium");
  });

  it("does not record the same struggling topic twice", () => {
    let state = INITIAL_ADAPTIVE_STATE;
    for (let i = 0; i < 5; i += 1) {
      state = adaptDifficulty(state, { isCorrect: false, topic: "Equilibrium" });
    }
    expect(state.strugglingTopics).toEqual(["equilibrium"]);
  });

  it("survives a question with no topic", () => {
    const state = adaptDifficulty(INITIAL_ADAPTIVE_STATE, {
      isCorrect: false,
      topic: null,
    });
    expect(state.missStreak).toBe(1);
  });
});

describe("reorderRemaining", () => {
  const pool = [
    q("e", "Alpha", "easy"),
    q("m", "Alpha", "medium"),
    q("h", "Alpha", "hard"),
  ];

  it("moves questions matching the current target to the front", () => {
    const harder = reorderRemaining(pool, { ...INITIAL_ADAPTIVE_STATE, target: "hard" });
    expect(harder[0].id).toBe("h");

    const easier = reorderRemaining(pool, { ...INITIAL_ADAPTIVE_STATE, target: "easy" });
    expect(easier[0].id).toBe("e");
  });

  it("pulls a struggling topic forward regardless of difficulty", () => {
    const mixed = [q("other", "Beta", "medium"), q("gap", "Gamma", "hard")];
    const result = reorderRemaining(mixed, {
      ...INITIAL_ADAPTIVE_STATE,
      target: "medium",
      strugglingTopics: ["gamma"],
    });
    expect(result[0].id).toBe("gap");
  });

  it("leaves a trivially short remainder alone", () => {
    expect(reorderRemaining([], INITIAL_ADAPTIVE_STATE)).toEqual([]);
    const one = [q("x", "Alpha")];
    expect(reorderRemaining(one, INITIAL_ADAPTIVE_STATE)).toEqual(one);
  });

  it("never drops or duplicates a question", () => {
    const result = reorderRemaining(pool, {
      ...INITIAL_ADAPTIVE_STATE,
      target: "hard",
      strugglingTopics: ["alpha"],
    });
    expect(result).toHaveLength(pool.length);
    expect(new Set(result.map((x) => x.id))).toEqual(new Set(pool.map((x) => x.id)));
  });
});
