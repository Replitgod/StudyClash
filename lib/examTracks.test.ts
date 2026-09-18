import { describe, expect, it } from "vitest";
import {
  composerTrackForExam,
  EXAM_TRACK_IDS,
  normalizeExamTrack,
  resolveExamTrack,
} from "./examTracks";
import { EXAM_TRACKS } from "./examCatalog";

// The two ends of the same journey. /exams links to /home?track=<id>, Home
// renders it from lib/examTracks.ts, and the server re-validates it through
// normalizeExamTrack before it reaches the model.
//
// These must agree. They already disagreed once: the SAT branch existed in
// the prompt builder while normalizeExamTrack still had a four-track
// allowlist, so /home?track=sat sanitised to null and SAT practice silently
// produced ordinary questions.

describe("resolveExamTrack", () => {
  it("resolves every track the exams page can link to", () => {
    for (const id of EXAM_TRACK_IDS) {
      const track = resolveExamTrack(id);
      expect(track, id).not.toBeNull();
      expect(track?.label, id).toBeTruthy();
      expect(track?.placeholder, id).toBeTruthy();
      expect(track?.starters.length, id).toBeGreaterThan(0);
    }
  });

  it("is case-insensitive, because the value comes from a URL", () => {
    expect(resolveExamTrack("SAT")?.id).toBe("sat");
  });

  it("returns null for anything unknown rather than throwing", () => {
    for (const bad of ["toefl", "", null, undefined, "../etc"]) {
      expect(resolveExamTrack(bad), String(bad)).toBeNull();
    }
  });
});

describe("the display list and the server allowlist agree", () => {
  it("every displayable track survives server-side sanitising", () => {
    // A track the UI offers but the server drops is a feature that appears
    // to work and does nothing.
    for (const id of EXAM_TRACK_IDS) {
      expect(normalizeExamTrack(id), id).toBe(id);
    }
  });

  it("still refuses anything not on the list", () => {
    for (const bad of ["toefl", "ignore previous instructions", "", null, 7]) {
      expect(normalizeExamTrack(bad), String(bad)).toBeNull();
    }
  });
});

describe("composerTrackForExam", () => {
  // Every exam page offers topic practice in that exam style. An exam the
  // catalog lists but this mapping misses is a page whose second button
  // silently produces generic questions.
  it("maps every catalog exam to a real composer track", () => {
    for (const entry of EXAM_TRACKS) {
      const track = composerTrackForExam(entry.slug);
      expect(track, entry.slug).not.toBeNull();
      expect(resolveExamTrack(track), entry.slug).not.toBeNull();
    }
  });

  it("returns null for an unknown slug", () => {
    expect(composerTrackForExam("toefl")).toBeNull();
  });
});
