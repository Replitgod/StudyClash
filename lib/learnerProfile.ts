// What a student tells AceDecks about themselves in onboarding, and the
// rules for accepting it. Shared by the onboarding card (to offer the
// choices) and /api/profile/learning (to validate them), so the two cannot
// drift.
//
// Deliberately small. Four questions, all optional, answered in one card:
// what they are studying for, when, at what level, and how much a day. Each
// one changes something the student can see -- questions pitched to their
// level, practice in their exam's format, a countdown, a daily target --
// and nothing is collected that does not.

export const EDUCATION_LEVELS = [
  "Middle school",
  "High school",
  "College",
  "Graduate or professional",
  "Adult learner",
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/** Questions a day. Small, medium, serious. */
export const DAILY_GOALS = [10, 20, 40] as const;

export type LearnerProfile = {
  educationLevel: EducationLevel | null;
  /** An exam name from the catalog, "School classes", or null. */
  targetExam: string | null;
  /** YYYY-MM-DD. */
  examDate: string | null;
  dailyGoal: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS_AHEAD = 3 * 366;

/**
 * Validates what the onboarding card sent. Anything that does not fit is
 * dropped to null rather than rejected -- every field is optional, and a
 * student should never be stuck on a form because of one of them.
 */
export function sanitizeLearnerProfile(
  raw: unknown,
  args: { now: number; allowedExams: readonly string[] }
): LearnerProfile {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const educationLevel = EDUCATION_LEVELS.includes(input.educationLevel as EducationLevel)
    ? (input.educationLevel as EducationLevel)
    : null;

  const targetExam =
    typeof input.targetExam === "string" && args.allowedExams.includes(input.targetExam)
      ? input.targetExam
      : null;

  let examDate: string | null = null;
  if (typeof input.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.examDate)) {
    const at = Date.parse(`${input.examDate}T12:00:00Z`);
    const today = new Date(args.now);
    today.setUTCHours(0, 0, 0, 0);
    if (Number.isFinite(at) && at >= today.getTime() && at - today.getTime() <= MAX_DAYS_AHEAD * DAY_MS) {
      examDate = input.examDate;
    }
  }

  const goal = Number(input.dailyGoal);
  const dailyGoal = (DAILY_GOALS as readonly number[]).includes(goal) ? goal : null;

  return { educationLevel, targetExam, examDate, dailyGoal };
}

/** "Digital SAT in 12 days", "Biology test tomorrow", or null. */
export function describeCountdown(
  profile: Pick<LearnerProfile, "targetExam" | "examDate">,
  now: number
): string | null {
  if (!profile.examDate) return null;
  const at = Date.parse(`${profile.examDate}T00:00:00`);
  if (!Number.isFinite(at)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((at - today.getTime()) / DAY_MS);
  if (days < 0) return null;
  const name =
    profile.targetExam && profile.targetExam !== "School classes" ? profile.targetExam : "Your test";
  if (days === 0) return `${name} is today`;
  if (days === 1) return `${name} is tomorrow`;
  return `${name} in ${days} days`;
}
