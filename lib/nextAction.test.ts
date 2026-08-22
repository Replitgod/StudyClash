import { describe, expect, it } from "vitest";
import { getNextAction, getTodaysPlan, greeting, sessionHref } from "./nextAction";
import { buildSnapshot, EMPTY_SNAPSHOT, type DeckRow, type TopicRow } from "./studySnapshot";

const NOW = Date.parse("2026-08-22T12:00:00.000Z");

function deck(id: string, title: string): DeckRow {
  return {
    id,
    title,
    course_name: "My Study",
    student_name: "Student",
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function weakTopic(deckId: string, name: string): TopicRow {
  return {
    deck_id: deckId,
    topic: name,
    status: "weak",
    correct_count: 2,
    total_count: 10,
    next_review_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("sessionHref", () => {
  // These have to match exactly what the session screens parse
  // (app/study/[deckId] and the older app/battle/[deckId]). Both ignore
  // anything they do not recognise, so a wrong parameter name produces a
  // link that looks fine and quietly starts the wrong session.
  it("links straight to the deck when nothing is narrowed", () => {
    expect(sessionHref({ deckId: "d1" })).toBe("/study/d1");
  });

  it("passes topics as a comma-separated, individually encoded list", () => {
    expect(sessionHref({ deckId: "d1", topics: ["Safavid Empire", "Gunpowder"] })).toBe(
      "/study/d1?topics=Safavid%2520Empire%2CGunpowder"
    );
  });

  it("includes mode and limit when they are set", () => {
    expect(sessionHref({ deckId: "d1", mode: "practice", limit: 10 })).toBe(
      "/study/d1?mode=practice&limit=10"
    );
  });

  it("omits the default battle mode", () => {
    expect(sessionHref({ deckId: "d1", mode: "battle" })).toBe("/study/d1");
  });
});

describe("getNextAction", () => {
  it("recommends nothing when there is nothing to study", () => {
    expect(getNextAction(EMPTY_SNAPSHOT)).toBeNull();
  });

  it("prefers review over anything new", () => {
    const snapshot = buildSnapshot({
      decks: [deck("d1", "AP World"), deck("d2", "Chemistry")],
      matches: [],
      topics: [weakTopic("d1", "Safavid Empire")],
      now: NOW,
    });

    const action = getNextAction(snapshot);
    expect(action?.label).toBe("Review what you forgot");
    expect(action?.href).toContain("/study/d1");
    expect(action?.href).toContain("mode=weak_topic");
  });

  it("names the count when several topics in one deck are due", () => {
    const snapshot = buildSnapshot({
      decks: [deck("d1", "AP World")],
      matches: [],
      topics: [weakTopic("d1", "Safavid Empire"), weakTopic("d1", "Gunpowder")],
      now: NOW,
    });

    const action = getNextAction(snapshot);
    expect(action?.reason).toContain("2 topics");
    expect(action?.href).toContain("Safavid");
    expect(action?.href).toContain("Gunpowder");
  });

  it("falls back to unstudied material when nothing is due", () => {
    const snapshot = buildSnapshot({
      decks: [deck("d1", "Chemistry")],
      matches: [],
      topics: [],
      now: NOW,
    });

    const action = getNextAction(snapshot);
    expect(action?.label).toBe("Start studying");
    expect(action?.href).toBe("/study/d1");
  });

  it("always gives an estimate a student can plan around", () => {
    const snapshot = buildSnapshot({
      decks: [deck("d1", "Chemistry")],
      matches: [],
      topics: [],
      now: NOW,
    });
    expect(getNextAction(snapshot)?.minutes).toBeGreaterThanOrEqual(5);
  });
});

describe("getTodaysPlan", () => {
  it("is empty when there is nothing to study", () => {
    expect(getTodaysPlan(EMPTY_SNAPSHOT)).toEqual([]);
  });

  it("never lists the same material twice", () => {
    const snapshot = buildSnapshot({
      decks: [deck("d1", "AP World")],
      matches: [],
      topics: [weakTopic("d1", "Safavid Empire"), weakTopic("d1", "Gunpowder")],
      now: NOW,
    });

    const plan = getTodaysPlan(snapshot);
    expect(plan).toHaveLength(1);
    expect(plan[0].detail).toBe("2 topics to review");
  });

  it("stops at three items", () => {
    const decks = ["a", "b", "c", "d", "e"].map((id) => deck(id, `Deck ${id}`));
    const snapshot = buildSnapshot({ decks, matches: [], topics: [], now: NOW });
    expect(getTodaysPlan(snapshot).length).toBeLessThanOrEqual(3);
  });
});

describe("greeting", () => {
  it("changes across the day", () => {
    expect(greeting(new Date("2026-08-22T08:00:00"))).toBe("Good morning");
    expect(greeting(new Date("2026-08-22T14:00:00"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-08-22T20:00:00"))).toBe("Good evening");
  });
});
