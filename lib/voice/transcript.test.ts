import { describe, expect, it } from "vitest";
import { isAnswerable, isLikelySilence } from "./transcript";

describe("isLikelySilence", () => {
  it("treats nothing as nothing", () => {
    expect(isLikelySilence("")).toBe(true);
    expect(isLikelySilence("   ")).toBe(true);
    expect(isLikelySilence(null)).toBe(true);
    expect(isLikelySilence(undefined)).toBe(true);
    expect(isLikelySilence("\n\t ")).toBe(true);
  });

  it("rejects transcripts with no letters or digits", () => {
    for (const text of [".", "...", "…", "?", "♪", "♪♪♪", "-", "!!"]) {
      expect(isLikelySilence(text)).toBe(true);
    }
  });

  // The documented failure mode of Whisper-family models: handed silence,
  // they return the most probable end-of-clip phrase from their training
  // data rather than an empty string.
  it("catches the stock phrases transcribers emit for silence", () => {
    for (const text of [
      "you",
      "You.",
      "Thank you.",
      "thank you",
      "Thanks for watching!",
      "Thank you for watching.",
      "Bye.",
      "Please subscribe",
      "[BLANK_AUDIO]",
      "(music)",
      "Okay.",
      "Hmm.",
      "um",
    ]) {
      expect(isLikelySilence(text)).toBe(true);
    }
  });

  it("catches the same artifact repeated, which is what a long silence gives", () => {
    expect(isLikelySilence("You. You. You.")).toBe(true);
    expect(isLikelySilence("Thank you. Thank you.")).toBe(true);
    expect(isLikelySilence("you you you you")).toBe(true);
  });

  // The important half. Over-filtering would make her ignore real answers,
  // which is a worse bug than the one being fixed.
  it("never rejects a real answer, however short", () => {
    for (const text of [
      "ATP",
      "Water",
      "The mitochondria",
      "mitochondria",
      "I don't know",
      "no idea",
      "Photosynthesis",
      "It makes energy",
      "Two identical cells",
      "Water moves down the gradient",
      "Uhh, the nucleus?",
      "um, ATP I think",
      "Okay so it's the thylakoid",
      "Thank you, is it the mitochondria?",
      "6",
      "6.02 times ten to the twenty three",
    ]) {
      expect(isLikelySilence(text)).toBe(false);
    }
  });

  it("keeps an artifact word when it is part of a longer sentence", () => {
    // "you" is an artifact alone and a pronoun in a sentence.
    expect(isLikelySilence("you said it was the nucleus")).toBe(false);
    expect(isLikelySilence("can you repeat that")).toBe(false);
  });

  it("treats a hesitation with content as real speech", () => {
    expect(isLikelySilence("um... the mitochondria")).toBe(false);
    expect(isLikelySilence("hmm, water?")).toBe(false);
  });
});

describe("isAnswerable", () => {
  it("is the inverse, so callers do not have to negate at every site", () => {
    expect(isAnswerable("ATP")).toBe(true);
    expect(isAnswerable("Thank you.")).toBe(false);
    expect(isAnswerable("")).toBe(false);
  });
});
