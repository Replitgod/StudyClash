import { describe, expect, it } from "vitest";
import { buildSnapshot, type DeckRow, type MatchRow, type TopicRow } from "./studySnapshot";

// buildSnapshot is what every app screen renders from -- Home's "do this
// next", Library's mastery numbers, Practice's weak-topic list. A mistake
// here does not throw, it just quietly points every button at the wrong
// thing, so the shape of its output is worth pinning down.

const NOW = Date.parse("2026-08-22T12:00:00.000Z");

function deck(overrides: Partial<DeckRow> & { id: string }): DeckRow {
  return {
    title: `Deck ${overrides.id}`,
    course_name: "My Study",
    student_name: "Student",
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function topic(overrides: Partial<TopicRow> & { deck_id: string; topic: string }): TopicRow {
  return {
    status: "improving",
    correct_count: 8,
    total_count: 10,
    // Well in the future, i.e. not due.
    next_review_at: "2026-12-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildSnapshot", () => {
  it("reports an account with no decks as empty", () => {
    const snapshot = buildSnapshot({ decks: [], matches: [], topics: [], now: NOW });
    expect(snapshot.isEmpty).toBe(true);
    expect(snapshot.overallMastery).toBeNull();
  });

  it("leaves mastery null for a deck that has never been studied", () => {
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a" })],
      matches: [],
      topics: [],
      now: NOW,
    });
    expect(snapshot.decks[0].mastery).toBeNull();
    expect(snapshot.decks[0].lastStudiedAt).toBeNull();
  });

  it("averages mastery across every session on a deck, not just the last one", () => {
    const matches: MatchRow[] = [
      { deck_id: "a", correct_answers: 5, total_questions: 10, created_at: "2026-08-10T00:00:00.000Z" },
      { deck_id: "a", correct_answers: 9, total_questions: 10, created_at: "2026-08-12T00:00:00.000Z" },
    ];
    const snapshot = buildSnapshot({ decks: [deck({ id: "a" })], matches, topics: [], now: NOW });
    expect(snapshot.decks[0].mastery).toBe(70);
    expect(snapshot.decks[0].lastStudiedAt).toBe("2026-08-12T00:00:00.000Z");
  });

  it("orders decks by when they were last studied, falling back to when they were made", () => {
    const decks = [
      deck({ id: "old", created_at: "2026-01-01T00:00:00.000Z" }),
      deck({ id: "new", created_at: "2026-08-20T00:00:00.000Z" }),
    ];
    const matches: MatchRow[] = [
      { deck_id: "old", correct_answers: 1, total_questions: 1, created_at: "2026-08-21T00:00:00.000Z" },
    ];
    const snapshot = buildSnapshot({ decks, matches, topics: [], now: NOW });
    // "old" was created first but studied most recently, so it leads.
    expect(snapshot.decks.map((d) => d.id)).toEqual(["old", "new"]);
  });

  it("treats a weak topic as due regardless of its scheduled date", () => {
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a" })],
      matches: [],
      topics: [
        topic({
          deck_id: "a",
          topic: "Stoichiometry",
          status: "weak",
          next_review_at: "2027-01-01T00:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    expect(snapshot.dueTopics.map((t) => t.topic)).toEqual(["Stoichiometry"]);
    expect(snapshot.decks[0].dueTopics).toEqual(["Stoichiometry"]);
  });

  it("treats a past review date as due even when the topic is not weak", () => {
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a" })],
      matches: [],
      topics: [
        topic({
          deck_id: "a",
          topic: "Mughal Empire",
          status: "improving",
          next_review_at: "2026-08-01T00:00:00.000Z",
        }),
      ],
      now: NOW,
    });
    expect(snapshot.dueTopics.map((t) => t.topic)).toEqual(["Mughal Empire"]);
  });

  it("does not treat a future review date on a healthy topic as due", () => {
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a" })],
      matches: [],
      topics: [topic({ deck_id: "a", topic: "Ottoman government" })],
      now: NOW,
    });
    expect(snapshot.dueTopics).toEqual([]);
  });

  it("puts the weakest topic first", () => {
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a" })],
      matches: [],
      topics: [
        topic({ deck_id: "a", topic: "Strong", correct_count: 9, total_count: 10, status: "weak" }),
        topic({ deck_id: "a", topic: "Weak", correct_count: 2, total_count: 10, status: "weak" }),
      ],
      now: NOW,
    });
    expect(snapshot.dueTopics.map((t) => t.topic)).toEqual(["Weak", "Strong"]);
  });

  it("drops topic rows whose deck no longer exists", () => {
    // A deleted deck leaves orphaned schedule rows behind. Surfacing them
    // would put a link on screen that goes nowhere.
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a" })],
      matches: [],
      topics: [topic({ deck_id: "deleted", topic: "Ghost", status: "weak" })],
      now: NOW,
    });
    expect(snapshot.topics).toEqual([]);
    expect(snapshot.dueTopics).toEqual([]);
  });

  it("groups decks by course and averages each course's mastery", () => {
    const decks = [
      deck({ id: "a", course_name: "Chemistry" }),
      deck({ id: "b", course_name: "Chemistry" }),
      deck({ id: "c", course_name: "History" }),
    ];
    const matches: MatchRow[] = [
      { deck_id: "a", correct_answers: 6, total_questions: 10, created_at: "2026-08-10T00:00:00.000Z" },
      { deck_id: "b", correct_answers: 8, total_questions: 10, created_at: "2026-08-10T00:00:00.000Z" },
    ];
    const snapshot = buildSnapshot({ decks, matches, topics: [], now: NOW });

    const chemistry = snapshot.courses.find((c) => c.name === "Chemistry");
    const history = snapshot.courses.find((c) => c.name === "History");

    expect(chemistry?.decks).toHaveLength(2);
    expect(chemistry?.mastery).toBe(70);
    // No sessions at all, so there is no honest number to show.
    expect(history?.mastery).toBeNull();
  });

  it("falls back to a course name when a deck has none", () => {
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a", course_name: "   " })],
      matches: [],
      topics: [],
      now: NOW,
    });
    expect(snapshot.decks[0].course).toBe("General");
  });

  it("ignores matches that are not attached to a deck", () => {
    const snapshot = buildSnapshot({
      decks: [deck({ id: "a" })],
      matches: [
        { deck_id: null, correct_answers: 10, total_questions: 10, created_at: "2026-08-10T00:00:00.000Z" },
      ],
      topics: [],
      now: NOW,
    });
    expect(snapshot.decks[0].mastery).toBeNull();
  });
});
