import { describe, expect, it } from "vitest";
import {
  EXAM_TRACKS,
  findExamTrack,
  findTrackByExamSlug,
  isTrackPlayable,
  trackAction,
} from "./examCatalog";

const SAT = findExamTrack("sat")!;
const AP = findExamTrack("ap")!;

describe("the catalog", () => {
  it("has a unique slug for every track", () => {
    const slugs = EXAM_TRACKS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every track a board link, including the ones with no bank", () => {
    for (const entry of EXAM_TRACKS) {
      expect(entry.officialUrl).toMatch(/^https:\/\//);
      expect(entry.officialLabel.length).toBeGreaterThan(0);
    }
  });

  it("resolves a slug regardless of case or padding", () => {
    expect(findExamTrack("SAT")?.slug).toBe("sat");
    expect(findExamTrack("  nclex ")?.slug).toBe("nclex");
  });

  // The old page rendered generic "Exam practice" copy for any string at
  // all, which put an indexable page at /exams/anything.
  it("returns null for a slug that is not an exam", () => {
    expect(findExamTrack("physics")).toBeNull();
    expect(findExamTrack("")).toBeNull();
    expect(findExamTrack(null)).toBeNull();
  });

  it("maps back from an exam_definitions slug", () => {
    expect(findTrackByExamSlug("digital-sat")?.slug).toBe("sat");
    expect(findTrackByExamSlug("nclex-rn")?.slug).toBe("nclex");
    expect(findTrackByExamSlug("not-an-exam")).toBeNull();
  });
});

describe("whether a track can be practised", () => {
  it("needs a bank and a published exam", () => {
    expect(
      isTrackPlayable({ track: SAT, examStatus: "available", publishedQuestions: 98 })
    ).toBe(true);
  });

  // Both halves fail independently, and both used to. An exam could be
  // "available" with an empty bank -- which is what every coming-soon row
  // was -- and a bank could exist behind an exam nobody had switched on.
  it("is false when the exam is switched on but empty", () => {
    expect(
      isTrackPlayable({ track: SAT, examStatus: "available", publishedQuestions: 0 })
    ).toBe(false);
  });

  it("is false when the bank exists but the exam is not published", () => {
    expect(
      isTrackPlayable({ track: SAT, examStatus: "coming_soon", publishedQuestions: 98 })
    ).toBe(false);
  });

  it("is false for a track with no exam behind it at all", () => {
    expect(
      isTrackPlayable({ track: AP, examStatus: "available", publishedQuestions: 500 })
    ).toBe(false);
  });

  it("treats missing information as not playable", () => {
    expect(isTrackPlayable({ track: SAT })).toBe(false);
    expect(isTrackPlayable({ track: SAT, examStatus: null, publishedQuestions: null })).toBe(
      false
    );
  });
});

describe("what the card's button does", () => {
  // The whole point: the old button went to /home?track=sat, the composer,
  // where the student typed a topic. It now starts a real attempt.
  it("starts a real attempt on the exam, not the topic composer", () => {
    const action = trackAction({
      track: SAT,
      examStatus: "available",
      publishedQuestions: 98,
    });

    expect(action).toEqual({
      label: "Practise Digital SAT",
      href: "/diagnostics/digital-sat",
    });
    expect(action!.href).not.toContain("/home");
  });

  // Null is a real outcome with its own rendering, rather than a button that
  // quietly goes somewhere unrelated.
  it("offers nothing when there is nothing honest to offer", () => {
    expect(trackAction({ track: AP, examStatus: "available", publishedQuestions: 0 })).toBeNull();
    expect(
      trackAction({ track: SAT, examStatus: "coming_soon", publishedQuestions: 98 })
    ).toBeNull();
  });
});
