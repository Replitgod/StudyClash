import { describe, expect, it } from "vitest";
import { extractPlanMarkers, inferAssessmentType } from "./vyraPlanParsing";

describe("extractPlanMarkers", () => {
  it("extracts a valid due date and assessment name, stripping both lines", () => {
    const reply = [
      "Exam & date",
      "AP Biology on Friday, July 24 2026 (7 days remaining)",
      "",
      "Priority topics",
      "Cellular respiration, first.",
      "PLAN_DUE_DATE: 2026-07-24",
      "PLAN_ASSESSMENT_NAME: AP Bio Unit 4 Exam",
    ].join("\n");

    const result = extractPlanMarkers(reply);
    expect(result.dueDate).toBe("2026-07-24");
    expect(result.assessmentName).toBe("AP Bio Unit 4 Exam");
    expect(result.cleanedText).not.toContain("PLAN_DUE_DATE");
    expect(result.cleanedText).not.toContain("PLAN_ASSESSMENT_NAME");
    expect(result.cleanedText).toContain("Cellular respiration");
  });

  it("returns null dueDate and strips the line when the date is malformed, never leaking it to the student", () => {
    const reply = "Priority topics\nSomething.\nPLAN_DUE_DATE: next friday";
    const result = extractPlanMarkers(reply);
    expect(result.dueDate).toBeNull();
    expect(result.cleanedText).not.toContain("PLAN_DUE_DATE");
  });

  it("returns nulls and the original text unchanged when no markers are present", () => {
    const reply = "Tell me the subject and date of your upcoming exam.";
    const result = extractPlanMarkers(reply);
    expect(result.dueDate).toBeNull();
    expect(result.assessmentName).toBeNull();
    expect(result.cleanedText).toBe(reply);
  });
});

describe("inferAssessmentType", () => {
  it("detects a final exam", () => {
    expect(inferAssessmentType("I have my chem final next week")).toBe("final_exam");
  });

  it("detects a midterm", () => {
    expect(inferAssessmentType("midterm is on Friday")).toBe("midterm");
  });

  it("detects a quiz", () => {
    expect(inferAssessmentType("small quiz tomorrow")).toBe("quiz");
  });

  it("detects a standardized test", () => {
    expect(inferAssessmentType("taking the SAT in March")).toBe("standardized_test");
  });

  it("falls back to unit_test when nothing matches", () => {
    expect(inferAssessmentType("I have a test on cells next Friday")).toBe("unit_test");
  });
});
