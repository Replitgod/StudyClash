// Shared spaced-repetition scheduling math, used by both the client-side
// Mastery Map view (app/mastery-map/page.tsx, computed live from match
// history) and the server-side topic_review_schedule writer/cron
// (app/api/battle/finish, app/api/cron/srs-reviews). Keeping this in one
// place means both views apply identical weak/improving/mastered thresholds
// and review-interval math instead of drifting apart over time.

export type TopicStatus = "mastered" | "improving" | "weak";
export type ReviewUrgency = "overdue" | "due_soon" | "scheduled" | "unscheduled";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTopicStatus(accuracy: number): TopicStatus {
  if (accuracy >= 85) return "mastered";
  if (accuracy >= 60) return "improving";
  return "weak";
}

// Per-question status (question_review_schedule) uses a correct-streak
// instead of accuracy -- a single question's accuracy over a handful of
// attempts is too noisy to threshold the way topic-level cumulative
// accuracy can. N correct in a row to graduate, any miss resets it, same
// idea as Knowt's per-card review mechanic.
export function getQuestionStatus(correctStreak: number): TopicStatus {
  if (correctStreak >= 3) return "mastered";
  if (correctStreak >= 1) return "improving";
  return "weak";
}

// Weak topics come back fast (cram pressure), improving topics get a short
// gap, and mastered topics get a growing interval the more times they've
// been drilled -- a topic mastered 8 times gets left alone longer than one
// that just crossed into "mastered".
export function getReviewIntervalDays(status: TopicStatus, attemptedCount: number): number {
  if (status === "weak") return 1;
  if (status === "improving") return 3;
  return Math.min(21, 7 + Math.max(0, attemptedCount - 3) * 2);
}

export function computeNextReviewAtMs(args: {
  status: TopicStatus;
  attemptedCount: number;
  lastPracticedMs: number;
}): number {
  const intervalDays = getReviewIntervalDays(args.status, args.attemptedCount);
  return args.lastPracticedMs + intervalDays * DAY_MS;
}

export function getReviewSchedule(args: {
  status: TopicStatus;
  attemptedCount: number;
  lastPracticedTs: number;
}): { label: string; urgency: ReviewUrgency } {
  const { status, attemptedCount, lastPracticedTs } = args;

  if (lastPracticedTs <= 0) {
    return {
      label: "Not scheduled yet -- practice once to start review timing.",
      urgency: "unscheduled",
    };
  }

  const nextReviewTs = computeNextReviewAtMs({
    status,
    attemptedCount,
    lastPracticedMs: lastPracticedTs,
  });
  const msUntilDue = nextReviewTs - Date.now();
  const daysUntilDue = Math.ceil(msUntilDue / DAY_MS);

  if (daysUntilDue <= 0) {
    return { label: "Review due now", urgency: "overdue" };
  }

  if (daysUntilDue === 1) {
    return { label: "Review due tomorrow", urgency: "due_soon" };
  }

  if (daysUntilDue <= 2) {
    return { label: `Review due in ${daysUntilDue} days`, urgency: "due_soon" };
  }

  return { label: `Next review in ${daysUntilDue} days`, urgency: "scheduled" };
}
