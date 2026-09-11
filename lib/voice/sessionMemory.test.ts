import { describe, expect, it } from "vitest";
import {
  describeSessionMemory,
  describeWhen,
  readSessionMemory,
  type PastSessionRow,
} from "@/lib/voice/sessionMemory";

const NOW = new Date("2026-09-10T18:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3600000;
const DAY = 86400000;

function row(overrides: Partial<PastSessionRow> = {}): PastSessionRow {
  return {
    ended_at: ago(2 * DAY),
    started_at: ago(2 * DAY + HOUR),
    topics_covered: ["Photosynthesis"],
    summary: {
      strengths: ["Light Reactions"],
      weaknesses: ["Calvin Cycle"],
      misconceptions: ["Calvin Cycle: thinks it needs direct light"],
    },
    ...overrides,
  };
}

describe("describeWhen", () => {
  it("says what a person would say, not a timestamp", () => {
    expect(describeWhen(new Date(NOW.getTime() - 2 * HOUR), NOW)).toBe("earlier today");
    expect(describeWhen(new Date(NOW.getTime() - 1 * DAY), NOW)).toBe("yesterday");
    expect(describeWhen(new Date(NOW.getTime() - 3 * DAY), NOW)).toBe("3 days ago");
    expect(describeWhen(new Date(NOW.getTime() - 9 * DAY), NOW)).toBe("last week");
    expect(describeWhen(new Date(NOW.getTime() - 200 * DAY), NOW)).toBe("a while back");
  });

  it("rounds a 25-hour-old call down to yesterday", () => {
    // Spoken aloud, "1 day ago" for something that happened last night is
    // not what anyone would say.
    expect(describeWhen(new Date(NOW.getTime() - 25 * HOUR), NOW)).toBe("yesterday");
  });

  it("does not produce a negative age from a clock skew", () => {
    expect(describeWhen(new Date(NOW.getTime() + HOUR), NOW)).toBe("recently");
  });
});

describe("readSessionMemory", () => {
  it("reads strengths, weaknesses and misconceptions out of a stored summary", () => {
    const memory = readSessionMemory(row(), NOW);

    expect(memory).not.toBeNull();
    expect(memory!.when).toBe("2 days ago");
    expect(memory!.strengths).toEqual(["Light Reactions"]);
    expect(memory!.weaknesses).toEqual(["Calvin Cycle"]);
    expect(memory!.misconceptions).toEqual(["Calvin Cycle: thinks it needs direct light"]);
  });

  it("returns nothing for a call where nothing was answered", () => {
    // Otherwise the next call opens with "last time we covered nothing",
    // which is worse than opening fresh.
    const empty = readSessionMemory(
      row({ summary: { strengths: [], weaknesses: [], misconceptions: [] } }),
      NOW
    );
    expect(empty).toBeNull();
  });

  it("survives a summary that is missing, malformed, or the wrong shape", () => {
    expect(readSessionMemory(row({ summary: null }), NOW)).toBeNull();
    expect(readSessionMemory(row({ summary: "not an object" }), NOW)).toBeNull();
    expect(
      readSessionMemory(row({ summary: { strengths: "Light Reactions" } }), NOW)
    ).toBeNull();
  });

  it("ignores empty strings rather than emitting blanks into the prompt", () => {
    const memory = readSessionMemory(
      row({ summary: { strengths: ["", "  "], weaknesses: ["Calvin Cycle"], misconceptions: [] } }),
      NOW
    );
    expect(memory!.strengths).toEqual([]);
    expect(memory!.weaknesses).toEqual(["Calvin Cycle"]);
  });

  it("falls back to started_at when a call never reported an ending", () => {
    const memory = readSessionMemory(row({ ended_at: null, started_at: ago(1 * DAY) }), NOW);
    expect(memory!.when).toBe("yesterday");
  });

  it("caps each list so history cannot crowd out the teaching instructions", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Concept ${i}`);
    const memory = readSessionMemory(
      row({ summary: { strengths: many, weaknesses: many, misconceptions: many } }),
      NOW
    );
    expect(memory!.strengths).toHaveLength(3);
    expect(memory!.weaknesses).toHaveLength(3);
    expect(memory!.misconceptions).toHaveLength(3);
  });
});

describe("describeSessionMemory", () => {
  it("is empty when there is nothing to remember", () => {
    expect(describeSessionMemory(null)).toBe("");
  });

  it("names the specific error the student made", () => {
    const text = describeSessionMemory(readSessionMemory(row(), NOW));

    expect(text).toContain("You last spoke 2 days ago, about Photosynthesis.");
    expect(text).toContain("Light Reactions");
    expect(text).toContain("shaky on Calvin Cycle");
    expect(text).toContain("thinks it needs direct light");
  });

  it("tells the tutor to check rather than re-teach", () => {
    // A model handed "they struggled with X" will otherwise open by
    // re-explaining X from the top, which is exactly what a student who
    // half-learned it last time does not need.
    const text = describeSessionMemory(readSessionMemory(row(), NOW));
    expect(text).toMatch(/not re-teach/i);
    expect(text).toMatch(/not recite this list/i);
  });

  it("still works when the call recorded no topic name", () => {
    const text = describeSessionMemory(readSessionMemory(row({ topics_covered: [] }), NOW));
    expect(text).toContain("You last spoke 2 days ago.");
    expect(text).not.toContain("about ,");
  });
});
