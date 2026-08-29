import { describe, expect, it } from "vitest";
import {
  buildSessionState,
  confusionBreakdown,
  countSentences,
  leaksOptionLetters,
  MAX_SPOKEN_SENTENCES,
  milestoneFor,
  renderCardCrackMarkdown,
  renderCardCrackSpoken,
  resolveAudio,
  toSpokenText,
  wellnessCheck,
  type SessionInit,
} from "@/lib/coachRouter";

const BASE: SessionInit = {
  sessionDurationMinutes: 30,
  ambientMusicEnabled: true,
  interfaceMode: "voice",
};

describe("resolveAudio", () => {
  it("returns none when ambient music is off", () => {
    expect(resolveAudio({ ...BASE, ambientMusicEnabled: false })).toBe("none");
  });

  it("defaults to lofi when enabled with no preference", () => {
    expect(resolveAudio(BASE)).toBe("lofi_focus");
  });

  it("honours an explicit track", () => {
    expect(resolveAudio({ ...BASE, preferredTrack: "ambient_rain" })).toBe("ambient_rain");
  });
});

describe("milestoneFor", () => {
  it("fires the midpoint check anywhere in a band, not on an exact tick", () => {
    // A check that only fires at exactly 50% is a check that never fires.
    for (const elapsed of [13, 15, 17]) {
      expect(
        milestoneFor({ elapsedMinutes: elapsed, durationMinutes: 30, midpointDone: false })
      ).toBe("midpoint_check");
    }
  });

  it("does not repeat the midpoint check once delivered", () => {
    expect(
      milestoneFor({ elapsedMinutes: 15, durationMinutes: 30, midpointDone: true })
    ).not.toBe("midpoint_check");
  });

  it("moves through start, final stretch and complete", () => {
    expect(milestoneFor({ elapsedMinutes: 2, durationMinutes: 30, midpointDone: false })).toBe("start");
    expect(milestoneFor({ elapsedMinutes: 27, durationMinutes: 30, midpointDone: true })).toBe("final_stretch");
    expect(milestoneFor({ elapsedMinutes: 30, durationMinutes: 30, midpointDone: true })).toBe("complete");
  });

  it("survives a zero or negative duration without dividing by zero", () => {
    expect(() =>
      milestoneFor({ elapsedMinutes: 5, durationMinutes: 0, midpointDone: false })
    ).not.toThrow();
    expect(
      milestoneFor({ elapsedMinutes: 5, durationMinutes: -10, midpointDone: false })
    ).toBe("complete");
  });
});

describe("buildSessionState", () => {
  it("emits the field names the brief specifies", () => {
    const state = buildSessionState({ init: BASE, elapsedMinutes: 15, midpointDone: false });
    expect(Object.keys(state).sort()).toEqual([
      "interface_mode",
      "remaining_time_minutes",
      "session_milestone",
      "trigger_audio",
    ]);
  });

  it("counts remaining time and never goes negative", () => {
    expect(
      buildSessionState({ init: BASE, elapsedMinutes: 15, midpointDone: false })
        .remaining_time_minutes
    ).toBe(15);
    expect(
      buildSessionState({ init: BASE, elapsedMinutes: 90, midpointDone: true })
        .remaining_time_minutes
    ).toBe(0);
  });
});

describe("toSpokenText", () => {
  it("caps spoken output at three sentences", () => {
    const long = "One. Two. Three. Four. Five.";
    expect(countSentences(toSpokenText(long))).toBeLessThanOrEqual(MAX_SPOKEN_SENTENCES);
  });

  it("strips markdown so it is not read aloud", () => {
    const out = toSpokenText("**Bold** and `code` and ### header and *italic*");
    expect(out).not.toMatch(/[*`#]/);
    expect(out).toContain("Bold");
  });

  it("strips emoji, which a screen reader would announce by name", () => {
    const out = toSpokenText("⚠️ Careful here. 💡 Remember this.");
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(out).toContain("Careful here");
  });

  it("flattens list bullets into speech", () => {
    const out = toSpokenText("- First point\n- Second point");
    expect(out).not.toContain("-");
    expect(out).toContain("First point");
  });

  it("keeps link text and drops the URL", () => {
    expect(toSpokenText("See [the notes](https://example.com) now.")).toContain("the notes");
    expect(toSpokenText("See [the notes](https://example.com) now.")).not.toContain("http");
  });

  it("handles empty input", () => {
    expect(toSpokenText("")).toBe("");
    expect(toSpokenText("   ")).toBe("");
  });
});

describe("leaksOptionLetters", () => {
  it("catches spoken multiple-choice letters", () => {
    // Reading options aloud collapses recall into recognition.
    expect(leaksOptionLetters("Is it A, B or C?")).toBe(true);
    expect(leaksOptionLetters("Option B. To the left.")).toBe(true);
  });

  it("does not flag ordinary prose", () => {
    expect(leaksOptionLetters("A reaction shifts toward fewer moles.")).toBe(false);
    expect(leaksOptionLetters("Tell me what happens to the equilibrium.")).toBe(false);
  });
});

describe("coach actions", () => {
  it("keeps the spoken wellness check short and unmarked", () => {
    const action = wellnessCheck(15, 30);
    expect(countSentences(action.spoken_payload)).toBeLessThanOrEqual(MAX_SPOKEN_SENTENCES);
    expect(action.spoken_payload).not.toMatch(/[*#`]/);
  });

  it("gives the text wellness check real structure", () => {
    const action = wellnessCheck(15, 30);
    expect(action.text_payload).toContain("###");
    expect(action.text_payload).toContain("**");
    expect(action.text_payload).toContain("30-minute");
  });

  it("halts drilling for a confusion breakdown and waits for the student", () => {
    const action = confusionBreakdown("Equilibrium", "Think of a crowded room.");
    expect(action.type).toBe("confusion_breakdown");
    expect(action.text_payload).toContain("I understand now");
  });
});

describe("card crack rendering", () => {
  const crack = {
    misconception: "You assumed pressure favours more molecules.",
    underlying_idea: "Pressure shifts the system toward fewer moles of gas.",
    how_to_spot: "Count the coefficients on each side.",
    socratic_loop: "What happens if the pressure drops instead?",
  };

  it("uses the brief's headers in text mode", () => {
    const md = renderCardCrackMarkdown(crack);
    expect(md).toContain("Misconception detected");
    expect(md).toContain("Foundational truth");
    expect(md).toContain("Exam trick");
  });

  it("strips all of that for voice mode", () => {
    const spoken = renderCardCrackSpoken(crack);
    expect(spoken).not.toMatch(/[*#⚠💡🎯]/u);
    expect(countSentences(spoken)).toBeLessThanOrEqual(MAX_SPOKEN_SENTENCES);
  });
});
