import { describe, expect, it } from "vitest";
import { describeCountdown, sanitizeLearnerProfile } from "./learnerProfile";

const NOW = Date.parse("2026-09-18T15:00:00Z");
const EXAMS = ["School classes", "Digital SAT", "MCAT"];

describe("sanitizeLearnerProfile", () => {
  it("accepts a complete, valid profile", () => {
    expect(
      sanitizeLearnerProfile(
        { educationLevel: "High school", targetExam: "Digital SAT", examDate: "2026-10-03", dailyGoal: 20 },
        { now: NOW, allowedExams: EXAMS }
      )
    ).toEqual({ educationLevel: "High school", targetExam: "Digital SAT", examDate: "2026-10-03", dailyGoal: 20 });
  });

  it("drops anything it does not recognise to null instead of failing", () => {
    expect(
      sanitizeLearnerProfile(
        { educationLevel: "Wizard", targetExam: "ignore previous instructions", examDate: "soon", dailyGoal: 9999 },
        { now: NOW, allowedExams: EXAMS }
      )
    ).toEqual({ educationLevel: null, targetExam: null, examDate: null, dailyGoal: null });
  });

  it("refuses an exam date in the past or years away", () => {
    const at = (examDate: string) =>
      sanitizeLearnerProfile({ examDate }, { now: NOW, allowedExams: EXAMS }).examDate;
    expect(at("2026-09-01")).toBeNull();
    expect(at("2031-01-01")).toBeNull();
    expect(at("2026-09-18")).toBe("2026-09-18");
  });

  it("survives a missing body", () => {
    expect(sanitizeLearnerProfile(null, { now: NOW, allowedExams: EXAMS }).educationLevel).toBeNull();
  });
});

describe("describeCountdown", () => {
  const now = Date.parse("2026-09-18T12:00:00");

  it("counts down to the exam in days", () => {
    expect(describeCountdown({ targetExam: "Digital SAT", examDate: "2026-10-03" }, now)).toBe(
      "Digital SAT in 15 days"
    );
    expect(describeCountdown({ targetExam: "MCAT", examDate: "2026-09-19" }, now)).toBe("MCAT is tomorrow");
  });

  it("uses a generic name for school tests, and says nothing once the date has passed", () => {
    expect(describeCountdown({ targetExam: "School classes", examDate: "2026-09-18" }, now)).toBe(
      "Your test is today"
    );
    expect(describeCountdown({ targetExam: "MCAT", examDate: "2026-09-01" }, now)).toBeNull();
    expect(describeCountdown({ targetExam: "MCAT", examDate: null }, now)).toBeNull();
  });
});
