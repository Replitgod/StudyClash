import { describe, expect, it } from "vitest";
import {
  buildFlashcardPrompt,
  cardsFromImportedQuestions,
  checkFlashcard,
  checkFlashcardBatch,
  describeNextReview,
  flashcardTarget,
  isCardDue,
  NEW_CARD_STATE,
  orderForReview,
  reviewCard,
  type CardState,
} from "./flashcards";

const NOW = Date.parse("2026-09-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("checkFlashcard", () => {
  it("accepts a specific prompt with a short answer", () => {
    const result = checkFlashcard({
      front: "What does the electron transport chain produce most of?",
      back: "ATP",
      topic: "Respiration",
      kind: "concept",
    });
    expect(result.ok).toBe(true);
  });

  // The whole reason this module exists: a multiple-choice stem cannot be
  // answered from memory once its options are gone.
  it("rejects fronts that need a list of options", () => {
    expect(
      checkFlashcard({ front: "Which of the following is a noble gas?", back: "Neon" }).ok
    ).toBe(false);
  });

  it("rejects a card whose answer is already printed on the front", () => {
    expect(
      checkFlashcard({
        front: "Mitochondria are the powerhouse of the cell. What are they called?",
        back: "Mitochondria",
      })
    ).toEqual({ ok: false, reason: "the answer is already on the front" });
  });

  it("rejects paragraph-length answers", () => {
    expect(checkFlashcard({ front: "Explain the French Revolution.", back: "x ".repeat(400) }).ok).toBe(false);
  });

  it("defaults an unknown kind to concept and drops a note that repeats the answer", () => {
    const result = checkFlashcard({
      front: "What is the SI unit of force?",
      back: "The newton",
      note: "the newton",
      kind: "trivia",
    });
    expect(result.ok && result.card.kind).toBe("concept");
    expect(result.ok && result.card.note).toBeNull();
  });
});

describe("checkFlashcardBatch", () => {
  const card = (front: string, topic = "Forces") => ({ front, back: "An answer", topic });

  it("drops near-duplicate fronts", () => {
    const cards = checkFlashcardBatch(
      [card("What is Newton's second law?"), card("What is Newton's second law of motion?")],
      { perTopicCap: null, maxCards: 10 }
    );
    expect(cards).toHaveLength(1);
  });

  it("keeps cards that share only question scaffolding", () => {
    const cards = checkFlashcardBatch(
      [card("What is the SI unit of force?"), card("What is the SI unit of energy?")],
      { perTopicCap: null, maxCards: 10 }
    );
    expect(cards).toHaveLength(2);
  });

  it("caps cards per topic when the tier has a cap", () => {
    const nouns = ["friction", "inertia", "momentum", "torque", "impulse", "pressure", "buoyancy", "tension"];
    const many = nouns.map((noun) => card(`What does ${noun} measure in mechanics?`));
    expect(checkFlashcardBatch(many, { perTopicCap: 5, maxCards: 20 })).toHaveLength(5);
    expect(checkFlashcardBatch(many, { perTopicCap: null, maxCards: 20 })).toHaveLength(8);
  });

  it("stops at the maximum", () => {
    const nouns = ["velocity", "acceleration", "energy", "power", "work", "density", "weight", "mass"];
    const many = nouns.map((noun, i) => card(`How is ${noun} defined in physics?`, `T${i}`));
    expect(checkFlashcardBatch(many, { perTopicCap: null, maxCards: 3 })).toHaveLength(3);
  });
});

describe("cardsFromImportedQuestions", () => {
  it("recovers the original term and definition from imported questions", () => {
    expect(
      cardsFromImportedQuestions([
        { question_text: 'What is the definition of "osmosis"?', correct_answer: "Water moving across a membrane", topic: null },
        { question_text: 'What is the answer for "2 + 2"?', correct_answer: "4", topic: "Math" },
        { question_text: "Something else entirely?", correct_answer: "x" },
      ])
    ).toEqual([
      { front: "osmosis", back: "Water moving across a membrane", note: null, topic: "General", kind: "definition" },
      { front: "2 + 2", back: "4", note: null, topic: "Math", kind: "definition" },
    ]);
  });
});

describe("reviewCard", () => {
  it("brings a failed card back in minutes, not tomorrow", () => {
    const next = reviewCard(NEW_CARD_STATE, "again", NOW);
    expect(Date.parse(next.dueAt!) - NOW).toBe(10 * 60 * 1000);
    expect(next.repetitions).toBe(0);
  });

  it("counts a lapse only on a card that had been learned", () => {
    expect(reviewCard(NEW_CARD_STATE, "again", NOW).lapses).toBe(0);
    const learned: CardState = { ...NEW_CARD_STATE, repetitions: 3, intervalDays: 15, dueAt: new Date(NOW).toISOString() };
    expect(reviewCard(learned, "again", NOW).lapses).toBe(1);
  });

  it("grows the interval with successful reviews", () => {
    let state = NEW_CARD_STATE;
    const intervals: number[] = [];
    let t = NOW;
    for (let i = 0; i < 4; i += 1) {
      state = reviewCard(state, "good", t);
      intervals.push(state.intervalDays);
      t += state.intervalDays * DAY;
    }
    expect(intervals[0]).toBe(1);
    expect(intervals[1]).toBe(6);
    expect(intervals[3]).toBeGreaterThan(intervals[2]);
  });

  it("grows the interval less on 'hard' without resetting a known card", () => {
    const known: CardState = { ...NEW_CARD_STATE, repetitions: 3, intervalDays: 10, ease: 2.5 };
    const hard = reviewCard(known, "hard", NOW);
    const good = reviewCard(known, "good", NOW);
    expect(hard.intervalDays).toBe(12);
    expect(hard.repetitions).toBe(4);
    expect(good.intervalDays).toBeGreaterThan(hard.intervalDays);
  });
});

describe("due and ordering", () => {
  it("treats a new card as due", () => {
    expect(isCardDue(null, NOW)).toBe(true);
    expect(isCardDue({ ...NEW_CARD_STATE, dueAt: new Date(NOW + DAY).toISOString() }, NOW)).toBe(false);
  });

  it("shows the most overdue reviews first, then new cards in written order", () => {
    const at = (offsetDays: number): CardState => ({
      ...NEW_CARD_STATE,
      repetitions: 1,
      dueAt: new Date(NOW + offsetDays * DAY).toISOString(),
    });
    const ordered = orderForReview(
      [
        { id: "new-2", position: 2, state: null },
        { id: "due-1", position: 0, state: at(-1) },
        { id: "later", position: 1, state: at(3) },
        { id: "due-5", position: 5, state: at(-5) },
        { id: "new-1", position: 1, state: null },
      ],
      NOW
    );
    expect(ordered.map((c) => c.id)).toEqual(["due-5", "due-1", "new-1", "new-2"]);
  });

  it("describes the next review plainly", () => {
    expect(describeNextReview(NEW_CARD_STATE, NOW)).toBe("New");
    expect(describeNextReview({ ...NEW_CARD_STATE, dueAt: new Date(NOW + 10 * 60 * 1000).toISOString() }, NOW)).toBe(
      "Back in a few minutes"
    );
    expect(describeNextReview({ ...NEW_CARD_STATE, dueAt: new Date(NOW + DAY).toISOString() }, NOW)).toBe(
      "Back tomorrow"
    );
    expect(describeNextReview({ ...NEW_CARD_STATE, dueAt: new Date(NOW + 6 * DAY).toISOString() }, NOW)).toBe(
      "Back in 6 days"
    );
  });
});

describe("flashcardTarget and prompt", () => {
  it("asks for a sensible number of cards", () => {
    expect(flashcardTarget(5)).toBe(8);
    expect(flashcardTarget(15)).toBe(18);
    expect(flashcardTarget(50)).toBe(24);
  });

  it("forbids the multiple-choice phrasing that made the old cards unanswerable", () => {
    expect(buildFlashcardPrompt({ notes: "n", count: 5 })).toContain('Never "Which of the following"');
  });
});
