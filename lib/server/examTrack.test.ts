import { describe, expect, it } from "vitest";
import { detectExamTrack, isKnownExamTrack } from "./resourceSearch";

describe("detectExamTrack", () => {
  it("recognises the SAT and the PSAT", () => {
    expect(detectExamTrack("SAT Math practice")).toBe("sat");
    expect(detectExamTrack("PSAT/NMSQT prep")).toBe("sat");
  });

  it("does not mistake the past tense of 'sit' for the exam", () => {
    // The whole reason this matches on capitals rather than the lowercased
    // text: "sat" is an extremely common English word.
    expect(detectExamTrack("The student sat down and read the passage")).toBeUndefined();
    expect(detectExamTrack("we sat through the whole lecture")).toBeUndefined();
  });

  it("does not read LSAT as SAT", () => {
    expect(detectExamTrack("LSAT logical reasoning")).toBe("lsat");
  });

  it("still recognises the other tracks", () => {
    expect(detectExamTrack("MCAT biochemistry")).toBe("mcat");
    expect(detectExamTrack("NCLEX pharmacology")).toBe("nclex");
    expect(detectExamTrack("AP World History")).toBe("ap");
  });

  it("returns nothing for ordinary study material", () => {
    expect(detectExamTrack("Photosynthesis notes for biology")).toBeUndefined();
  });
});

describe("isKnownExamTrack", () => {
  it("accepts sat now that it is a real track", () => {
    expect(isKnownExamTrack("sat")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["gre", "", null, undefined, 3]) {
      expect(isKnownExamTrack(bad)).toBe(false);
    }
  });
});
