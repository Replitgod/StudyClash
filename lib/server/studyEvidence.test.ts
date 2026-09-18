import { describe, expect, it } from "vitest";
import { nextTopicState, statusForTier, type TopicRowState } from "./studyEvidence";

const NOW = Date.parse("2026-09-18T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const delta = (correct: number, total: number, extra: Partial<{ recoveries: number; confidentMisses: number }> = {}) => ({
  correct,
  total,
  recoveries: extra.recoveries ?? 0,
  confidentMisses: extra.confidentMisses ?? 0,
});

function row(overrides: Partial<TopicRowState> = {}): TopicRowState {
  return {
    correct_count: 0,
    total_count: 0,
    attempts: 0,
    recoveries: 0,
    confident_misses: 0,
    last_practiced_at: null,
    next_review_at: null,
    ...overrides,
  };
}

function reviewInMs(state: ReturnType<typeof nextTopicState>): number {
  return Date.parse(state.row.next_review_at) - NOW;
}

describe("nextTopicState", () => {
  it("never makes a topic due the instant the student finishes it", () => {
    const state = nextTopicState({ existing: null, delta: delta(0, 4), now: NOW, session: "new" });
    expect(reviewInMs(state)).toBeGreaterThanOrEqual(4 * HOUR);
  });

  // The bug this replaces: lifetime accuracy kept a recovered student
  // "weak" and due every day forever.
  it("lets recent success outgrow an old bad start", () => {
    let existing: TopicRowState = row();
    let t = NOW - 30 * DAY;
    // A rough first session...
    let state = nextTopicState({ existing, delta: delta(1, 5), now: t, session: "new" });
    // ...then four solid, spaced sessions.
    for (let i = 0; i < 4; i += 1) {
      existing = { ...state.row };
      t += 6 * DAY;
      state = nextTopicState({ existing, delta: delta(5, 5), now: t, session: "new" });
    }
    expect(state.row.status).not.toBe("weak");
    expect(Date.parse(state.row.next_review_at) - t).toBeGreaterThan(DAY);
  });

  it("brings a topic back sooner after a confident miss", () => {
    const existing = row({ correct_count: 8, total_count: 10, attempts: 3, last_practiced_at: new Date(NOW - 5 * DAY).toISOString() });
    const slip = nextTopicState({ existing, delta: delta(4, 5), now: NOW, session: "new" });
    const misconception = nextTopicState({
      existing,
      delta: delta(4, 5, { confidentMisses: 1 }),
      now: NOW,
      session: "new",
    });
    expect(reviewInMs(misconception)).toBeLessThan(reviewInMs(slip));
    expect(misconception.row.confident_misses).toBe(1);
  });

  it("counts a flashcard minutes after the last one as the same sitting", () => {
    const existing = row({ correct_count: 3, total_count: 4, attempts: 2, last_practiced_at: new Date(NOW - 10 * 60 * 1000).toISOString() });
    expect(nextTopicState({ existing, delta: delta(1, 1), now: NOW, session: "auto" }).row.attempts).toBe(2);
    expect(nextTopicState({ existing, delta: delta(1, 1), now: NOW, session: "new" }).row.attempts).toBe(3);

    const yesterday = { ...existing, last_practiced_at: new Date(NOW - DAY).toISOString() };
    expect(nextTopicState({ existing: yesterday, delta: delta(1, 1), now: NOW, session: "auto" }).row.attempts).toBe(3);
  });

  it("reports whether the topic was due and whether it moved up a tier", () => {
    const due = row({
      correct_count: 2,
      total_count: 4,
      attempts: 1,
      last_practiced_at: new Date(NOW - 3 * DAY).toISOString(),
      next_review_at: new Date(NOW - DAY).toISOString(),
    });
    const state = nextTopicState({ existing: due, delta: delta(6, 6), now: NOW, session: "new" });
    expect(state.wasDue).toBe(true);
    expect(state.tierAfter).not.toBe(state.tierBefore);
  });

  it("maps mastery tiers onto the stored status column", () => {
    expect(statusForTier("needs_review")).toBe("weak");
    expect(statusForTier("developing")).toBe("improving");
    expect(statusForTier("strong")).toBe("mastered");
    expect(statusForTier("mastered")).toBe("mastered");
  });
});
