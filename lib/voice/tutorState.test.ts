import { describe, expect, it } from "vitest";
import {
  createSession,
  deriveState,
  hintLevelFor,
  masteryEstimates,
  recordAsked,
  recordAttempt,
  recordRequest,
  selectNextConcept,
  shouldStayOnActive,
  weakConcepts,
} from "./tutorState";
import type { Concept, TutorSession, Verdict } from "./types";

const CONCEPTS: Concept[] = [
  { id: "c1", label: "Mitosis", facts: ["Q: What is mitosis? A: Division into two identical cells"], priorWeak: false },
  { id: "c2", label: "Osmosis", facts: ["Q: What is osmosis? A: Water moving down a gradient"], priorWeak: true },
  { id: "c3", label: "Respiration", facts: ["Q: Where does respiration happen? A: Mitochondria"], priorWeak: false },
];

/** Ask about a concept, then answer it. The shape every real turn takes. */
function turn(
  session: TutorSession,
  conceptId: string,
  verdict: Verdict,
  atMs = 0
): TutorSession {
  return recordAttempt(recordAsked(session, conceptId), { conceptId, verdict, atMs });
}

describe("deriveState", () => {
  it("starts every concept unseen", () => {
    const session = createSession(CONCEPTS);
    expect(deriveState(session.progress.c1).valueOf()).toBe("unseen");
  });

  it("needs two clean correct answers before it will say mastered", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "correct");
    expect(session.progress.c1.state).toBe("understood");

    session = turn(session, "c1", "correct");
    expect(session.progress.c1.state).toBe("mastered");
  });

  it("does not call a concept mastered on partial answers alone", () => {
    let session = createSession(CONCEPTS);
    for (let i = 0; i < 5; i += 1) session = turn(session, "c1", "partial");

    // Strength is well past the mastery threshold, but there is not a single
    // correct answer on the record, so claiming mastery would be a lie.
    expect(session.progress.c1.strength).toBeGreaterThanOrEqual(4);
    expect(session.progress.c1.state).toBe("understood");
  });

  it("marks a concept shaky once it goes negative", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "incorrect");
    expect(session.progress.c1.state).toBe("shaky");
  });

  it("treats a correct answer that needed a hint as weaker evidence", () => {
    let clean = createSession(CONCEPTS);
    clean = turn(clean, "c1", "correct");
    clean = turn(clean, "c1", "correct");

    let hinted = createSession(CONCEPTS);
    hinted = turn(hinted, "c1", "incorrect"); // puts them on the hint ladder
    hinted = turn(hinted, "c1", "correct");
    hinted = turn(hinted, "c1", "correct");

    expect(clean.progress.c1.state).toBe("mastered");
    // Same number of correct answers, but one was walked to, so it has not
    // earned the same label.
    expect(hinted.progress.c1.state).not.toBe("mastered");
  });
});

describe("hint ladder", () => {
  it("escalates one rung per consecutive miss and never starts at the answer", () => {
    let session = createSession(CONCEPTS);
    expect(hintLevelFor(session.progress.c1)).toBe("none");

    session = turn(session, "c1", "incorrect");
    expect(hintLevelFor(session.progress.c1)).toBe("nudge");

    session = turn(session, "c1", "incorrect");
    expect(hintLevelFor(session.progress.c1)).toBe("concept");

    session = turn(session, "c1", "incorrect");
    expect(hintLevelFor(session.progress.c1)).toBe("breakdown");

    session = turn(session, "c1", "incorrect");
    expect(hintLevelFor(session.progress.c1)).toBe("explain");
  });

  it("resets the ladder the moment they get it right", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "incorrect");
    session = turn(session, "c1", "incorrect");
    expect(hintLevelFor(session.progress.c1)).toBe("concept");

    session = turn(session, "c1", "correct");
    expect(hintLevelFor(session.progress.c1)).toBe("none");
  });

  it("treats 'I don't know' as a miss that escalates help", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "unknown");
    expect(hintLevelFor(session.progress.c1)).toBe("nudge");
    expect(session.progress.c1.unknown).toBe(1);
  });

  it("does not escalate on a partial answer", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "incorrect");
    session = turn(session, "c1", "partial");
    // Still one rung up, not two: they are mid-thought, and jumping to a
    // stronger hint steps on the half they already have.
    expect(hintLevelFor(session.progress.c1)).toBe("nudge");
  });
});

describe("staying on a concept", () => {
  it("stays put while the student is still missing it", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "incorrect");
    expect(shouldStayOnActive(session)).toBe(true);
    expect(selectNextConcept(session)?.id).toBe("c1");
  });

  it("moves on once the concept has been ground on long enough", () => {
    let session = createSession(CONCEPTS);
    for (let i = 0; i < 5; i += 1) session = turn(session, "c1", "incorrect");

    expect(shouldStayOnActive(session)).toBe(false);
    expect(selectNextConcept(session)?.id).not.toBe("c1");
  });

  it("moves on after a correct answer", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "correct");
    expect(shouldStayOnActive(session)).toBe(false);
  });

  // The regression that defines the feature. "To create cells" as the
  // purpose of mitosis is the right area and the wrong answer; banking it
  // and changing the subject is the difference between a tutor and a quiz.
  it("stays on a half-answered concept to ask for the missing piece", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "partial");

    expect(shouldStayOnActive(session)).toBe(true);
    expect(selectNextConcept(session)?.id).toBe("c1");
    // ...without escalating help, because they already have half of it.
    expect(hintLevelFor(session.progress.c1)).toBe("none");
  });

  it("starts a fresh run when a concept comes back around later", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "partial");
    session = turn(session, "c1", "correct");
    // Work elsewhere, then return to c1 and miss it once.
    session = turn(session, "c2", "correct");
    session = turn(session, "c1", "incorrect");

    // One miss on this pass, not three carried over from earlier.
    expect(shouldStayOnActive(session)).toBe(true);
  });
});

describe("selectNextConcept", () => {
  it("opens on the concept the app already knew was weak", () => {
    const session = createSession(CONCEPTS);
    expect(selectNextConcept(session)?.id).toBe("c2");
  });

  it("never immediately re-asks the concept just answered", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c2", "correct");
    expect(selectNextConcept(session)?.id).not.toBe("c2");
  });

  it("comes back to a shaky concept later rather than dropping it", () => {
    let session = createSession(CONCEPTS);

    // Miss osmosis badly enough to be parked, then work elsewhere.
    for (let i = 0; i < 5; i += 1) session = turn(session, "c2", "incorrect");
    expect(session.progress.c2.state).toBe("shaky");

    session = turn(session, "c1", "correct");
    session = turn(session, "c3", "correct");
    session = turn(session, "c1", "correct");

    // The revisit gap has passed and shaky outranks everything, so it is
    // back on the table -- the "smart revisit" the brief asks for.
    expect(selectNextConcept(session)?.id).toBe("c2");
  });

  it("prefers unseen material over re-testing something understood", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c2", "correct");
    session = turn(session, "c2", "correct");

    const next = selectNextConcept(session);
    expect(next && session.progress[next.id].asked).toBe(0);
  });

  it("relaxes spacing rather than stalling when everything is on cooldown", () => {
    let session = createSession([CONCEPTS[0], CONCEPTS[1]]);
    session = turn(session, "c1", "correct");
    session = turn(session, "c2", "correct");

    // Both were just asked; a naive gap check would return nothing and the
    // tutor would go silent, which is worse than asking slightly early.
    expect(selectNextConcept(session)).not.toBeNull();
  });

  it("returns null only when there is no material at all", () => {
    expect(selectNextConcept(createSession([]))).toBeNull();
  });

  it("walks straight through the set in review-all mode", () => {
    let session = createSession(CONCEPTS);
    const seen: string[] = [];

    for (let i = 0; i < 3; i += 1) {
      const next = selectNextConcept(session, { style: "review_all" });
      if (!next) break;
      seen.push(next.id);
      session = turn(session, next.id, "correct");
    }

    expect(new Set(seen).size).toBe(3);
  });
});

describe("student requests", () => {
  it("raises difficulty when they ask for harder questions and remembers it", () => {
    const session = recordRequest(createSession(CONCEPTS), "harder");
    expect(session.difficulty).toBe("hard");
    expect(session.requests).toContain("harder");
  });

  it("lowers difficulty when they ask for easier ones", () => {
    expect(recordRequest(createSession(CONCEPTS), "easier").difficulty).toBe("easy");
  });
});

describe("mastery estimates", () => {
  it("reports nothing for material that was never asked about", () => {
    const rows = masteryEstimates(createSession(CONCEPTS));
    expect(rows.every((row) => row.percent === 0 && row.state === "unseen")).toBe(true);
  });

  it("rises with correct answers and falls with misses", () => {
    let good = createSession(CONCEPTS);
    good = turn(good, "c1", "correct");
    good = turn(good, "c1", "correct");

    let bad = createSession(CONCEPTS);
    bad = turn(bad, "c1", "incorrect");
    bad = turn(bad, "c1", "incorrect");

    const goodPct = masteryEstimates(good).find((r) => r.conceptId === "c1")!.percent;
    const badPct = masteryEstimates(bad).find((r) => r.conceptId === "c1")!.percent;

    expect(goodPct).toBeGreaterThan(badPct);
    expect(goodPct).toBeLessThanOrEqual(100);
    expect(badPct).toBeGreaterThanOrEqual(0);
  });
});

describe("weakConcepts", () => {
  it("lists the shakiest first and ignores untouched material", () => {
    let session = createSession(CONCEPTS);
    session = turn(session, "c1", "incorrect");
    session = turn(session, "c1", "incorrect");
    session = turn(session, "c2", "partial");

    const weak = weakConcepts(session);
    expect(weak[0].id).toBe("c1");
    expect(weak.map((c) => c.id)).not.toContain("c3");
  });
});

describe("immutability", () => {
  it("never mutates the session it was given", () => {
    const session = createSession(CONCEPTS);
    const snapshot = JSON.stringify(session);

    recordAttempt(recordAsked(session, "c1"), {
      conceptId: "c1",
      verdict: "correct",
      atMs: 0,
    });

    expect(JSON.stringify(session)).toBe(snapshot);
  });

  it("ignores an answer for a concept it does not have", () => {
    const session = createSession(CONCEPTS);
    const result = recordAttempt(session, {
      conceptId: "nope",
      verdict: "correct",
      atMs: 0,
    });
    expect(result).toBe(session);
  });
});
