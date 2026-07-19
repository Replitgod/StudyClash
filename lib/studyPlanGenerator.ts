import { getReviewIntervalDays, getTopicStatus } from "@/lib/srsSchedule";

// Pure, deterministic study-plan scaffolding shared by BOTH entry points:
// the multi-month post-diagnostic plan (Part 3) and the short-term
// post-battle plan (Part 4). No Supabase/secrets/Node-only APIs here, so
// it's safe to import from both API routes and client components (e.g.
// phaseLabel() rendering a task's phase badge on the plan page) -- unlike
// lib/server/diagnosticBank.ts, which genuinely must never reach the
// browser because it carries answer keys.
//
// Per the cost/reliability requirements, this is intentionally NOT an
// OpenAI call per plan -- task content is built from templates + the
// student's actual weak-topic list, so generation is free, instant, and
// reproducible. AI is only ever used (optionally, by the caller) to
// rephrase/polish task titles afterward, never to invent the schedule
// itself.

export type PlanIntensity = "light" | "balanced" | "intensive";

export type WeakTopicInput = {
  topic: string;
  // Lower accuracy = higher priority. Callers pass whatever accuracy signal
  // they have (diagnostic skill accuracy, or battle weak-topic accuracy).
  accuracy: number;
};

export type GeneratedTask = {
  scheduledDate: string; // yyyy-mm-dd
  topic: string;
  taskType: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  // `internal: true` marks a link back into AcedIQ itself (replay this
  // deck, practice this weak topic) rather than an external study
  // resource -- the plan page renders these as an in-app action button
  // instead of an external target="_blank" link, so a task actually closes
  // the loop back to practice instead of just describing it in prose.
  resourceLinks: { title: string; url: string; internal?: boolean }[];
};

export type GeneratePlanArgs = {
  startDate: Date;
  endDate: Date;
  unavailableWeekdays: number[]; // 0=Sunday..6=Saturday
  unavailableDateRanges?: { start: Date; end: Date }[];
  minutesPerWeekday: number;
  minutesPerWeekend: number;
  intensity: PlanIntensity;
  weakTopics: WeakTopicInput[];
  strongTopics: string[];
  deckReplayHint?: string; // deck title, folded into task descriptions
  deckId?: string; // when set, topic-focused tasks link straight to /battle/{deckId}?mode=weak_topic
  resourceCatalog: Record<string, { title: string; url: string }[]>;
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWithinAnyRange(date: Date, ranges: { start: Date; end: Date }[]): boolean {
  return ranges.some((range) => date >= range.start && date <= range.end);
}

export function computeAvailableDates(args: {
  startDate: Date;
  endDate: Date;
  unavailableWeekdays: number[];
  unavailableDateRanges?: { start: Date; end: Date }[];
}): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(args.startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(args.endDate);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const weekday = cursor.getDay();
    const excluded =
      args.unavailableWeekdays.includes(weekday) ||
      (args.unavailableDateRanges ? isWithinAnyRange(cursor, args.unavailableDateRanges) : false);

    if (!excluded) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function availableWeekdayNames(unavailableWeekdays: number[]): string[] {
  return WEEKDAY_NAMES.filter((_, idx) => !unavailableWeekdays.includes(idx));
}

type PhaseKey = "foundation" | "skill_building" | "test_application" | "final_review";

const PHASE_LABELS: Record<PhaseKey, string> = {
  foundation: "Foundation",
  skill_building: "Skill Building",
  test_application: "Test Application",
  final_review: "Final Review",
};

function buildPhaseBoundaries(totalDays: number): { phase: PhaseKey; days: number }[] {
  if (totalDays <= 3) {
    return [{ phase: "final_review", days: totalDays }];
  }
  if (totalDays <= 10) {
    // Short runway (a week or two): skip Foundation, go straight to
    // targeted practice and pacing, then rest.
    const finalReview = Math.max(2, Math.round(totalDays * 0.2));
    const testApplication = Math.max(2, Math.round(totalDays * 0.3));
    const skillBuilding = totalDays - finalReview - testApplication;
    return [
      { phase: "skill_building", days: Math.max(1, skillBuilding) },
      { phase: "test_application", days: testApplication },
      { phase: "final_review", days: finalReview },
    ];
  }

  const finalReview = Math.max(3, Math.round(totalDays * 0.1));
  const testApplication = Math.round(totalDays * 0.25);
  const skillBuilding = Math.round(totalDays * 0.35);
  const foundation = totalDays - finalReview - testApplication - skillBuilding;

  return [
    { phase: "foundation", days: Math.max(1, foundation) },
    { phase: "skill_building", days: skillBuilding },
    { phase: "test_application", days: testApplication },
    { phase: "final_review", days: finalReview },
  ];
}

function phaseForDayIndex(boundaries: { phase: PhaseKey; days: number }[], dayIndex: number): PhaseKey {
  let cursor = 0;
  for (const boundary of boundaries) {
    cursor += boundary.days;
    if (dayIndex < cursor) return boundary.phase;
  }
  return boundaries[boundaries.length - 1].phase;
}

const PHASE_TASK_VERBS: Record<PhaseKey, string> = {
  foundation: "Review the core concept behind",
  skill_building: "Drill mixed practice on",
  test_application: "Complete a timed set covering",
  final_review: "Do a final targeted check on",
};

function buildTaskForTopic(args: {
  phase: PhaseKey;
  topic: string;
  minutes: number;
  deckReplayHint?: string;
  deckId?: string;
  resourceLinks: { title: string; url: string; internal?: boolean }[];
}): GeneratedTask {
  const verb = PHASE_TASK_VERBS[args.phase];
  const questionCount = Math.max(5, Math.round(args.minutes / 2));

  const title = `${verb} ${args.topic}`;
  const descriptionParts = [
    `Spend ${args.minutes} minutes on ${args.topic}: review 2-3 worked examples, then complete ${questionCount} targeted practice questions.`,
    "Add anything you miss to your error log so it resurfaces in a later review day.",
  ];
  if (args.deckReplayHint) {
    descriptionParts.push(`Replay "${args.deckReplayHint}" afterward to reinforce it under battle conditions.`);
  }

  const resourceLinks = args.deckId
    ? [weakTopicPracticeLink(args.deckId, args.topic), ...args.resourceLinks]
    : args.resourceLinks;

  return {
    scheduledDate: "",
    topic: args.topic,
    taskType: args.phase,
    title,
    description: descriptionParts.join(" "),
    estimatedMinutes: args.minutes,
    resourceLinks,
  };
}

function buildReviewTask(minutes: number, recentTopics: string[]): GeneratedTask {
  return {
    scheduledDate: "",
    topic: recentTopics.join(", ") || "Recent mistakes",
    taskType: "review",
    title: "Review this week's missed questions",
    description: `Spend ${minutes} minutes going back through everything you got wrong this week (${
      recentTopics.slice(0, 3).join(", ") || "your error log"
    }) and redo those exact questions from memory.`,
    estimatedMinutes: minutes,
    resourceLinks: [],
  };
}

function buildCatchUpTask(minutes: number): GeneratedTask {
  return {
    scheduledDate: "",
    topic: "Buffer",
    taskType: "catch_up",
    title: "Catch-up / buffer day",
    description:
      "Use this day to finish anything you fell behind on this week. If you're fully caught up, do one light mixed-practice set instead.",
    estimatedMinutes: minutes,
    resourceLinks: [],
  };
}

function buildRestTask(): GeneratedTask {
  return {
    scheduledDate: "",
    topic: "Rest",
    taskType: "rest",
    title: "Rest before the exam",
    description:
      "No new material today. Skim your error log for five minutes if you want, then get a full night's sleep -- you're ready.",
    estimatedMinutes: 10,
    resourceLinks: [],
  };
}

// Core scheduler: walks every available date from start to end, assigns it
// a phase (by position in the overall timeline), and fills it with either a
// weak-topic study task, a weekly review day, an occasional catch-up
// buffer, or (on the last available day before the test) a rest day.
export function generateStudyPlanTasks(args: GeneratePlanArgs): GeneratedTask[] {
  const availableDates = computeAvailableDates({
    startDate: args.startDate,
    endDate: args.endDate,
    unavailableWeekdays: args.unavailableWeekdays,
    unavailableDateRanges: args.unavailableDateRanges,
  });

  if (availableDates.length === 0) return [];

  const totalDays = availableDates.length;
  const boundaries = buildPhaseBoundaries(totalDays);

  const sortedWeakTopics = [...args.weakTopics].sort((a, b) => a.accuracy - b.accuracy);
  const topicRotation = sortedWeakTopics.length > 0 ? sortedWeakTopics.map((t) => t.topic) : ["your weakest topics so far"];

  // Review-day cadence reuses lib/srsSchedule.ts's canonical interval
  // function (the same one driving the Mastery Map and topic_review_schedule)
  // instead of a hardcoded "every 6 days" -- a plan built from a genuinely
  // weak topic set should consolidate more often than one built from
  // mostly-improving topics. srsSchedule's raw intervals (weak=1, improving=3,
  // mastered=7-21) are tuned for a single topic's next-touch timing, not a
  // whole-plan cumulative review day, so this clamps into a sensible weekly
  // range [4, 8] rather than using the raw value verbatim (an unclamped
  // weak=1 would turn every single day into a review day and erase the
  // phase structure entirely).
  const worstTopicStatus = sortedWeakTopics.length > 0 ? getTopicStatus(sortedWeakTopics[0].accuracy) : "improving";
  const reviewCadenceDays = Math.max(4, Math.min(8, getReviewIntervalDays(worstTopicStatus, 0)));

  const tasks: GeneratedTask[] = [];
  const lastIndex = availableDates.length - 1;
  const recentTopicsThisWeek: string[] = [];
  let topicPointer = 0;
  let daysSinceReview = 0;

  availableDates.forEach((date, index) => {
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const minutes = isWeekend ? args.minutesPerWeekend : args.minutesPerWeekday;
    const phase = phaseForDayIndex(boundaries, index);

    // The last available day before the test is rest, EXCEPT when it's
    // the only available day -- a plan with a single day of runway (the
    // test is essentially tomorrow) must not spend its one and only
    // scheduled day on "no new material," or the student gets zero
    // practice out of a plan that promised to help them improve.
    if (index === lastIndex && totalDays > 1) {
      tasks.push({ ...buildRestTask(), scheduledDate: toDateKey(date) });
      return;
    }

    daysSinceReview += 1;
    const isReviewDay = daysSinceReview >= reviewCadenceDays && index < lastIndex - 1;
    const isCatchUpDay =
      !isReviewDay &&
      args.intensity !== "intensive" &&
      daysSinceReview === reviewCadenceDays - 1 &&
      index < lastIndex - 1;

    if (isReviewDay) {
      tasks.push({ ...buildReviewTask(minutes, recentTopicsThisWeek), scheduledDate: toDateKey(date) });
      recentTopicsThisWeek.length = 0;
      daysSinceReview = 0;
      return;
    }

    if (isCatchUpDay) {
      tasks.push({ ...buildCatchUpTask(minutes), scheduledDate: toDateKey(date) });
      return;
    }

    const topic = topicRotation[topicPointer % topicRotation.length];
    topicPointer += 1;
    recentTopicsThisWeek.push(topic);

    const resourceLinks = args.resourceCatalog[topic] || [];
    const task = buildTaskForTopic({
      phase,
      topic,
      minutes,
      deckReplayHint: args.deckReplayHint,
      deckId: args.deckId,
      resourceLinks,
    });
    tasks.push({ ...task, scheduledDate: toDateKey(date) });
  });

  return tasks;
}

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase as PhaseKey] || phase;
}

// Short-term, post-battle plan (Part 4). Deliberately a different shape
// than the long-term SAT-style phase scheduler above -- "prioritize the 1-2
// weakest topics" for a same-day/tomorrow deadline is a fundamentally
// different plan than a multi-week phase rotation, not just a shorter
// version of it.
export type ShortTermPlanArgs = {
  today: Date;
  dueDate: Date;
  weakTopics: WeakTopicInput[];
  deckId: string;
  deckTitle: string;
  minutesPerDay: number;
  resourceCatalog?: Record<string, { title: string; url: string }[]>;
};

function deckReplayLink(deckId: string): { title: string; url: string; internal: true } {
  return { title: "Replay this deck", url: `/battle/${deckId}`, internal: true };
}

function weakTopicPracticeLink(deckId: string, topic: string): { title: string; url: string; internal: true } {
  return {
    title: `Practice "${topic}" now`,
    url: `/battle/${deckId}?mode=weak_topic&topics=${encodeURIComponent(topic)}`,
    internal: true,
  };
}

function daysBetween(a: Date, b: Date): number {
  const start = new Date(a);
  start.setHours(0, 0, 0, 0);
  const end = new Date(b);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function generateShortTermPlanTasks(args: ShortTermPlanArgs): GeneratedTask[] {
  const daysUntil = daysBetween(args.today, args.dueDate);
  const sortedWeak = [...args.weakTopics].sort((a, b) => a.accuracy - b.accuracy);
  const topWeak = sortedWeak.slice(0, 2).map((t) => t.topic);
  const resourceCatalog = args.resourceCatalog || {};
  const tasks: GeneratedTask[] = [];

  // Due today or tomorrow: one short, focused session -- not a schedule.
  if (daysUntil <= 1) {
    const focusMinutes = Math.min(args.minutesPerDay, 30);
    tasks.push({
      scheduledDate: toDateKey(args.today),
      topic: topWeak.join(", ") || "your weakest topics",
      taskType: "targeted_practice",
      title: `Review ${topWeak[0] || "your weakest topic"} for ${focusMinutes} minutes`,
      description: `Focus only on ${topWeak.join(" and ") || "what you missed"} -- redo the exact questions you got wrong on "${args.deckTitle}" before doing anything else.`,
      estimatedMinutes: focusMinutes,
      resourceLinks: topWeak[0]
        ? [weakTopicPracticeLink(args.deckId, topWeak[0]), ...(resourceCatalog[topWeak[0]] || [])]
        : [],
    });
    tasks.push({
      scheduledDate: toDateKey(args.today),
      topic: "Deck replay",
      taskType: "deck_replay",
      title: `Replay "${args.deckTitle}"`,
      description: "One more full pass through the deck to confirm those fixes stuck.",
      estimatedMinutes: Math.max(10, args.minutesPerDay - focusMinutes),
      resourceLinks: [deckReplayLink(args.deckId)],
    });
    return tasks;
  }

  // Up to a week: a short daily rotation ending in a final check the day
  // before, not weekly phases (there's no room for phases in a week).
  if (daysUntil <= 7) {
    const dayPlan: { offset: number; type: string; label: string }[] = [
      { offset: 0, type: "concept_review", label: "Concept review" },
      { offset: 1, type: "targeted_practice", label: "Targeted practice" },
      { offset: 2, type: "spaced_review", label: "Spaced review" },
      { offset: 3, type: "mixed_practice", label: "Mixed practice" },
      { offset: 4, type: "targeted_practice", label: "Targeted practice" },
      { offset: 5, type: "deck_replay", label: "Deck replay" },
    ];

    dayPlan
      .filter((d) => d.offset < daysUntil)
      .forEach((d, idx) => {
        const date = new Date(args.today);
        date.setDate(date.getDate() + d.offset);
        const topic = topWeak[idx % Math.max(1, topWeak.length)] || "your weakest topics";

        tasks.push({
          scheduledDate: toDateKey(date),
          topic,
          taskType: d.type,
          title: d.type === "deck_replay" ? `Replay "${args.deckTitle}"` : `${d.label}: ${topic}`,
          description:
            d.type === "deck_replay"
              ? `Full replay of "${args.deckTitle}" to check retention before the final day.`
              : `Spend ${args.minutesPerDay} minutes on ${topic}, then redo any questions you missed last time on this topic.`,
          estimatedMinutes: args.minutesPerDay,
          resourceLinks:
            d.type === "deck_replay"
              ? [deckReplayLink(args.deckId)]
              : [weakTopicPracticeLink(args.deckId, topic), ...(resourceCatalog[topic] || [])],
        });
      });

    const finalCheckDate = new Date(args.dueDate);
    finalCheckDate.setDate(finalCheckDate.getDate() - 1);
    if (finalCheckDate >= args.today) {
      tasks.push({
        scheduledDate: toDateKey(finalCheckDate),
        topic: topWeak.join(", "),
        taskType: "final_check",
        title: "Final check the day before",
        description: `One quick, light pass over ${topWeak.join(" and ") || "your weak spots"} -- no new material, just confirm it's solid.`,
        estimatedMinutes: Math.min(20, args.minutesPerDay),
        resourceLinks: topWeak[0] ? [weakTopicPracticeLink(args.deckId, topWeak[0])] : [],
      });
    }

    return tasks;
  }

  // Weeks to months out: fall back to the same phase-based scheduler used
  // for exam prep, just with generic weekday defaults (a school assignment/
  // final months out doesn't have a meaningfully different shape from SAT
  // prep at that distance).
  return generateStudyPlanTasks({
    startDate: args.today,
    endDate: args.dueDate,
    unavailableWeekdays: [],
    minutesPerWeekday: args.minutesPerDay,
    minutesPerWeekend: args.minutesPerDay,
    intensity: "balanced",
    weakTopics: args.weakTopics,
    strongTopics: [],
    deckReplayHint: args.deckTitle,
    deckId: args.deckId,
    resourceCatalog,
  });
}
