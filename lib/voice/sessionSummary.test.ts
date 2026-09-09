import { describe, expect, it } from "vitest";
import { computeStats, summarizeSession } from "./sessionSummary";
import { applyTopicSwitch, createSession, recordAsked, recordAttempt } from "./tutorState";
import type { Concept, TutorSession, Verdict } from "./types";

const CONCEPTS: Concept[] = [
  { id: "c1", label: "Ionic bonding", facts: [], priorWeak: false },
  { id: "c2", label: "Cations and anions", facts: [], priorWeak: false },
  { id: "c3", label: "Covalent bonding", facts: [], priorWeak: false },
];

function turn(
  session: TutorSession,
  conceptId: string,
  verdict: Verdict,
  misconception?: string
): TutorSession {
  return recordAttempt(recordAsked(session, conceptId), {
    conceptId,
    verdict,
    misconception,
    atMs: 0,
  });
}

const TEN_MINUTES = 10 * 60 * 1000;

describe("computeStats", () => {
  it("counts what actually happened", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "correct");
    session = turn(session, "c1", "correct");
    session = turn(session, "c2", "incorrect");
    session = turn(session, "c2", "partial");

    const stats = computeStats(session, TEN_MINUTES);
    expect(stats.questionCount).toBe(4);
    expect(stats.correctCount).toBe(2);
    expect(stats.incorrectCount).toBe(1);
    expect(stats.partialCount).toBe(1);
    expect(stats.conceptsPracticed).toBe(2);
    expect(stats.conceptsMastered).toBe(1);
    expect(stats.durationMs).toBe(TEN_MINUTES);
  });

  it("never reports a negative duration", () => {
    expect(computeStats(createSession(CONCEPTS), -5000).durationMs).toBe(0);
  });
});

describe("summarizeSession", () => {
  it("names the concepts they got without help", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "correct");
    session = turn(session, "c1", "correct");

    const summary = summarizeSession(session, TEN_MINUTES);

    expect(summary.headline).toContain("Ionic bonding");
    expect(summary.headline).toMatch(/without needing a hint/i);
    expect(summary.strengths).toContain("Ionic bonding");
  });

  it("does not claim they nailed something they were walked to", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "incorrect");
    session = turn(session, "c1", "correct");
    session = turn(session, "c1", "correct");

    const summary = summarizeSession(session, TEN_MINUTES);
    expect(summary.headline).not.toMatch(/without needing a hint/i);
    expect(summary.headline).toMatch(/took a hint/i);
  });

  it("says how many times a stubborn concept came up short", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c2", "incorrect");
    session = turn(session, "c2", "unknown");
    session = turn(session, "c2", "incorrect");

    const summary = summarizeSession(session, TEN_MINUTES);
    expect(summary.headline).toContain("Cations and anions");
    expect(summary.headline).toMatch(/3 times/);
    expect(summary.weaknesses).toContain("Cations and anions");
  });

  it("quotes the specific wrong belief rather than describing it vaguely", () => {
    let session = createSession(CONCEPTS);
    session = turn(
      session,
      "c2",
      "incorrect",
      "thinks losing an electron makes an ion negative"
    );

    const summary = summarizeSession(session, TEN_MINUTES);
    expect(summary.headline).toContain("thinks losing an electron makes an ion negative");
    expect(summary.misconceptions[0]).toContain("Cations and anions");
    expect(summary.recommendation).toContain("thinks losing an electron makes an ion negative");
  });

  // The exact thing Phase 20 bans.
  it("never produces the generic encouragement it exists to replace", () => {
    const cases: TutorSession[] = [];

    let good = createSession(CONCEPTS);
    good = turn(good, "c1", "correct");
    good = turn(good, "c1", "correct");
    good = turn(good, "c2", "correct");
    good = turn(good, "c2", "correct");
    good = turn(good, "c3", "correct");
    good = turn(good, "c3", "correct");
    cases.push(good);

    let bad = createSession(CONCEPTS);
    for (const id of ["c1", "c2", "c3"]) {
      bad = turn(bad, id, "incorrect");
      bad = turn(bad, id, "unknown");
    }
    cases.push(bad);

    let mixed = createSession(CONCEPTS);
    mixed = turn(mixed, "c1", "correct");
    mixed = turn(mixed, "c2", "partial");
    mixed = turn(mixed, "c3", "incorrect");
    cases.push(mixed);

    const headlines = cases.map((session) => summarizeSession(session, TEN_MINUTES).headline);

    for (const headline of headlines) {
      expect(headline).not.toMatch(/great job|keep practicing|keep practicing|well done|amazing/i);
    }

    // And crucially, the three sessions do not read the same.
    expect(new Set(headlines).size).toBe(3);
  });

  it("recommends something concrete, not 'study more'", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c2", "incorrect");
    session = turn(session, "c2", "incorrect");

    const summary = summarizeSession(session, TEN_MINUTES);
    expect(summary.recommendation).toContain("Cations and anions");
    expect(summary.recommendation).not.toMatch(/study more|keep going|practice more/i);
  });

  it("points at the untouched material when nothing went badly", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "correct");
    session = turn(session, "c1", "correct");

    const summary = summarizeSession(session, TEN_MINUTES);
    expect(summary.weaknesses).toHaveLength(0);
    expect(summary.recommendation).toMatch(/2 concepts/);
  });

  it("admits an empty session instead of inventing praise for it", () => {
    const summary = summarizeSession(createSession(CONCEPTS), 5000);

    expect(summary.stats.questionCount).toBe(0);
    expect(summary.strengths).toHaveLength(0);
    expect(summary.headline).toMatch(/nothing to review/i);
    expect(summary.recommendation).toMatch(/nothing was recorded/i);
  });

  it("distinguishes an instant hang-up from sitting there saying nothing", () => {
    const quick = summarizeSession(createSession(CONCEPTS), 3000);
    const silent = summarizeSession(createSession(CONCEPTS), 4 * 60 * 1000);
    expect(quick.headline).not.toBe(silent.headline);
  });

  it("orders weaknesses worst-first so the top line is where time should go", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c2", "incorrect");
    session = turn(session, "c2", "incorrect");
    session = turn(session, "c2", "incorrect");
    session = turn(session, "c3", "partial");
    session = turn(session, "c3", "incorrect");

    const summary = summarizeSession(session, TEN_MINUTES);
    expect(summary.weaknesses[0]).toBe("Cations and anions");
  });

  it("reads as a plain sentence a student could act on", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "correct");
    session = turn(session, "c1", "correct");
    session = turn(session, "c2", "incorrect", "confuses cations with anions");
    session = turn(session, "c2", "incorrect");

    const { headline } = summarizeSession(session, 11 * 60 * 1000);

    expect(headline).toMatch(/^You explained Ionic bonding without needing a hint\./);
    expect(headline).toContain("Cations and anions came up short 2 times");
    expect(headline).toContain("confuses cations with anions");
  });
});

// A call that changed subject is two lessons. Without this the concept names
// from both halves are listed together as though they belonged to one topic,
// and a student who moved from photosynthesis to algebra reads a paragraph
// that silently mixes them.
describe("a call that covered more than one subject", () => {
  function twoSubjectSession() {
    const biology: Concept[] = [
      { id: "c1", label: "Photosynthesis", facts: ["f"], priorWeak: false },
      { id: "c2", label: "Osmosis", facts: ["f"], priorWeak: false },
    ];
    const algebra: Concept[] = [
      { id: "c1", label: "Absolute value", facts: ["f"], priorWeak: false },
      { id: "c2", label: "Vertex form", facts: ["f"], priorWeak: false },
    ];

    let session = createSession(biology, undefined, "Photosynthesis");
    session = recordAsked(session, "c1");
    session = recordAttempt(session, { conceptId: "c1", verdict: "correct", atMs: 1000 });

    session = applyTopicSwitch(session, "algebra 2", algebra);
    session = recordAsked(session, "s1c1");
    session = recordAttempt(session, { conceptId: "s1c1", verdict: "correct", atMs: 2000 });

    return session;
  }

  it("opens the review by naming both subjects", () => {
    const summary = summarizeSession(twoSubjectSession(), 300000);
    expect(summary.headline).toMatch(/covered Photosynthesis and algebra 2/i);
    expect(summary.topics).toEqual(["Photosynthesis", "algebra 2"]);
  });

  // The concepts from before the switch are still in the list, so their
  // labels must still resolve -- a raw "c1" in a review is the failure this
  // whole design is arranged to prevent.
  it("still names concepts from the subject they left", () => {
    const summary = summarizeSession(twoSubjectSession(), 300000);
    expect(summary.headline).toContain("Photosynthesis");
    expect(summary.headline).not.toMatch(/\bc1\b|\bs1c1\b/);
  });

  it("says nothing about subjects when the call stayed on one", () => {
    let session = createSession(
      [{ id: "c1", label: "Photosynthesis", facts: ["f"], priorWeak: false }],
      undefined,
      "Photosynthesis"
    );
    session = recordAsked(session, "c1");
    session = recordAttempt(session, { conceptId: "c1", verdict: "correct", atMs: 1000 });

    const summary = summarizeSession(session, 120000);
    expect(summary.headline).not.toMatch(/You covered/i);
    expect(summary.topics).toEqual(["Photosynthesis"]);
  });
});
