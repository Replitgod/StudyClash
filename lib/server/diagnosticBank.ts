// Server-only. Validated-question-bank selection + scoring for the
// standardized-test diagnostic center. Never imported from a "use client"
// component -- every function here either touches the service-role
// Supabase client or the answer key, neither of which may reach the
// browser. Route handlers under app/api/diagnostics/* and
// app/api/admin/diagnostic-questions/* are the only callers.
//
// Reuses lib/irt.ts (the Rasch-model ability estimator already built for
// the AI opponent) for both the adaptive Module 2 routing decision and the
// final score-range estimate, instead of inventing a second ability model.
// This is explicitly NOT a reproduction of College Board's proprietary
// adaptive/scoring algorithm -- see the disclaimer stored on every
// exam_definitions row and surfaced on every diagnostic screen.

import type { SupabaseClient } from "@supabase/supabase-js";
import { difficultyToBeta, probabilityCorrect, updateAbility } from "@/lib/irt";
import { getMasteryTier, MIN_ATTEMPTS_FOR_HIGH_TIER, type MasteryTier } from "@/lib/masteryTiers";

export type DifficultyLabel = "easy" | "medium" | "hard";

export type DiagnosticQuestionRow = {
  id: string;
  exam_id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: DifficultyLabel;
  question_type: "multiple_choice" | "student_produced_response";
  stimulus: string | null;
  question_text: string;
  answer_choices: unknown;
  correct_answer: string;
  explanation: string;
  status: string;
  source_type: string;
  reviewed_at: string | null;
  created_at: string;
};

export type ClientSafeQuestion = Omit<DiagnosticQuestionRow, "correct_answer" | "explanation" | "status" | "source_type" | "reviewed_at">;

// Strips the answer key before a question ever reaches the browser -- the
// one hard rule the whole diagnostic experience depends on ("do not reveal
// correctness during the diagnostic").
export function sanitizeQuestionForClient(question: DiagnosticQuestionRow): ClientSafeQuestion {
  const {
    correct_answer: _correctAnswer,
    explanation: _explanation,
    status: _status,
    source_type: _sourceType,
    reviewed_at: _reviewedAt,
    ...rest
  } = question;
  void _correctAnswer;
  void _explanation;
  void _status;
  void _sourceType;
  void _reviewedAt;
  return rest;
}

export async function fetchPublishedPool(
  supabase: SupabaseClient,
  examId: string,
  section: string
): Promise<DiagnosticQuestionRow[]> {
  const { data, error } = await supabase
    .from("diagnostic_questions")
    .select(
      "id, exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at, created_at"
    )
    .eq("exam_id", examId)
    .eq("section", section)
    .eq("status", "published");

  if (error) {
    throw new Error(`Failed to load diagnostic question bank: ${error.message}`);
  }

  return (data || []) as DiagnosticQuestionRow[];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Draws up to `count` questions from `pool` matching a target difficulty
// distribution, falling back to whatever's left in the pool if a difficulty
// tier is thinner than the target (a young question bank shouldn't hard-fail
// a diagnostic start -- it should just skew toward what's actually
// published yet).
export function pickByDifficultyDistribution(
  pool: DiagnosticQuestionRow[],
  count: number,
  weights: Partial<Record<DifficultyLabel, number>>,
  excludeIds: Set<string> = new Set()
): DiagnosticQuestionRow[] {
  const available = pool.filter((q) => !excludeIds.has(q.id));
  const byDifficulty: Record<DifficultyLabel, DiagnosticQuestionRow[]> = {
    easy: shuffle(available.filter((q) => q.difficulty === "easy")),
    medium: shuffle(available.filter((q) => q.difficulty === "medium")),
    hard: shuffle(available.filter((q) => q.difficulty === "hard")),
  };

  const totalWeight =
    (weights.easy || 0) + (weights.medium || 0) + (weights.hard || 0) || 1;
  const targets: Record<DifficultyLabel, number> = {
    easy: Math.round((count * (weights.easy || 0)) / totalWeight),
    medium: Math.round((count * (weights.medium || 0)) / totalWeight),
    hard: Math.round((count * (weights.hard || 0)) / totalWeight),
  };

  const selected: DiagnosticQuestionRow[] = [];
  const selectedIds = new Set<string>();

  (Object.keys(targets) as DifficultyLabel[]).forEach((tier) => {
    const take = byDifficulty[tier].slice(0, targets[tier]);
    take.forEach((q) => {
      selected.push(q);
      selectedIds.add(q.id);
    });
  });

  // Top up from any remaining questions (any difficulty) if the bank was
  // too thin in one tier to hit `count`.
  if (selected.length < count) {
    const leftovers = shuffle(available.filter((q) => !selectedIds.has(q.id)));
    for (const q of leftovers) {
      if (selected.length >= count) break;
      selected.push(q);
      selectedIds.add(q.id);
    }
  }

  return shuffle(selected.slice(0, count));
}

// Module 1 of a full diagnostic (and the whole quick diagnostic) uses a
// balanced 30/40/30 easy/medium/hard mix, per the spec's "balanced mix of
// easy, medium, and hard questions" requirement.
export function pickModule1Questions(
  pool: DiagnosticQuestionRow[],
  count: number
): DiagnosticQuestionRow[] {
  return pickByDifficultyDistribution(pool, count, { easy: 0.3, medium: 0.4, hard: 0.3 });
}

export type AdaptivePath = "harder" | "easier";

// The one adaptive decision this diagnostic makes, and it's a transparent,
// configured threshold (exam_definitions.configuration.adaptive.
// module2ThresholdAccuracy) -- not a claim of reproducing College Board's
// actual multistage routing algorithm.
export function chooseModule2Path(module1Accuracy: number, thresholdAccuracy: number): AdaptivePath {
  return module1Accuracy >= thresholdAccuracy ? "harder" : "easier";
}

const MODULE_2_WEIGHTS: Record<AdaptivePath, Partial<Record<DifficultyLabel, number>>> = {
  harder: { easy: 0.1, medium: 0.4, hard: 0.5 },
  easier: { easy: 0.4, medium: 0.45, hard: 0.15 },
};

export function pickModule2Questions(
  pool: DiagnosticQuestionRow[],
  count: number,
  path: AdaptivePath,
  excludeIds: Set<string>
): DiagnosticQuestionRow[] {
  return pickByDifficultyDistribution(pool, count, MODULE_2_WEIGHTS[path], excludeIds);
}

export type AttemptMode = "quick" | "full" | "weak_area";

// Weak-area retest: draws a balanced sample from ONLY the flagged skills,
// across whatever sections those skills happen to span -- unlike Module 1/2
// selection, there's no difficulty-distribution target here (a weak skill
// should be tested at whatever difficulty it has published questions at,
// not skewed toward a particular tier).
export function pickWeakAreaQuestions(
  pool: DiagnosticQuestionRow[],
  skills: string[],
  countPerSkill: number
): DiagnosticQuestionRow[] {
  const selected: DiagnosticQuestionRow[] = [];
  for (const skill of skills) {
    const skillPool = shuffle(pool.filter((q) => q.skill === skill));
    selected.push(...skillPool.slice(0, countPerSkill));
  }
  return shuffle(selected);
}

export type ScoredResponse = {
  difficulty: DifficultyLabel;
  isCorrect: boolean;
};

// Runs the same one-step-per-answer ability update lib/irt.ts already uses
// for the AI opponent, over a section's full response sequence, to get a
// single ability estimate (theta) for that section.
export function estimateSectionTheta(responses: ScoredResponse[]): number {
  let theta = 0;
  for (const response of responses) {
    const beta = difficultyToBeta(response.difficulty);
    theta = updateAbility(theta, beta, response.isCorrect);
  }
  return theta;
}

// Maps a theta (roughly -3..+3, 0 = average) onto the real Digital SAT
// section score band (200-800, multiples of 10), then widens into a range
// rather than a single number -- "show a score range rather than false
// precision" is a hard requirement, not a nice-to-have.
export function estimateSectionScoreRange(
  theta: number,
  path: AdaptivePath | null,
  mode: "quick" | "full"
): { low: number; high: number } {
  const raw = 500 + theta * 100;
  // The harder Module 2 path caps out with more headroom (a student who
  // earned the harder module and did reasonably well there is likely
  // scoring above what Module 1 alone would suggest); the easier path caps
  // ability estimates from climbing past what Module 2 could actually
  // confirm.
  const pathAdjustedRaw =
    path === "harder" ? raw + 20 : path === "easier" ? raw - 20 : raw;

  const center = Math.max(200, Math.min(800, Math.round(pathAdjustedRaw / 10) * 10));
  // A quick diagnostic saw far fewer items, so its range is deliberately
  // wider than a full diagnostic's -- less data, less false precision.
  const halfWidth = mode === "quick" ? 70 : 40;

  return {
    low: Math.max(200, Math.round((center - halfWidth) / 10) * 10),
    high: Math.min(800, Math.round((center + halfWidth) / 10) * 10),
  };
}

export function combineToCompositeRange(
  rw: { low: number; high: number },
  math: { low: number; high: number }
): { low: number; high: number } {
  return { low: rw.low + math.low, high: rw.high + math.high };
}

export { probabilityCorrect };

type FullResponseJoinRow = {
  question_id: string;
  selected_answer: string | null;
  is_correct: boolean | null;
  response_time_seconds: number | null;
  flagged: boolean;
  section: string;
  module: number;
  question: {
    domain: string;
    skill: string;
    difficulty: DifficultyLabel;
    correct_answer: string;
    explanation: string;
    question_text: string;
  };
};

// Scores a just-completed attempt: pulls every response across every
// section/module, computes the full results payload, writes
// diagnostic_results, and closes out diagnostic_attempts. Called once, from
// the submit-module route, the moment the final module (Math module 2 for
// full mode, Math module 1 for quick mode) is submitted -- there is no
// separate client-triggered "complete" call, so there's no window for a
// double-submit to race this.
export async function finalizeAttempt(
  supabase: SupabaseClient,
  attemptId: string
): Promise<DiagnosticResultsPayload> {
  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .select("id, user_id, exam_id, mode, adaptive_path")
    .eq("id", attemptId)
    .single();

  if (attemptError || !attempt) {
    throw new Error("Attempt not found while finalizing.");
  }

  const { data: rows, error: responsesError } = await supabase
    .from("diagnostic_responses")
    .select(
      "question_id, selected_answer, is_correct, response_time_seconds, flagged, section, module, question:diagnostic_questions(domain, skill, difficulty, correct_answer, explanation, question_text)"
    )
    .eq("attempt_id", attemptId);

  if (responsesError) {
    throw new Error(`Failed to load responses while finalizing: ${responsesError.message}`);
  }

  const responses = ((rows || []) as unknown as FullResponseJoinRow[]).map((row) => ({
    question_id: row.question_id,
    selected_answer: row.selected_answer,
    is_correct: row.is_correct,
    response_time_seconds: row.response_time_seconds,
    flagged: row.flagged,
    section: row.section,
    module: row.module,
    question: row.question,
  }));

  const results = computeDiagnosticResults(
    responses,
    attempt.mode as AttemptMode,
    (attempt.adaptive_path || {}) as Record<string, AdaptivePath>
  );

  await supabase.from("diagnostic_results").insert({
    attempt_id: attemptId,
    overall_accuracy: results.overallAccuracy,
    section_results: results.sectionResults,
    domain_results: results.domainResults,
    skill_results: results.skillResults,
    difficulty_results: results.difficultyResults,
    pacing_results: results.pacingResults,
    strongest_skills: results.strongestSkills,
    weakest_skills: results.weakestSkills,
    common_mistakes: results.commonMistakes,
    confidence_score: results.confidenceScore,
    readiness_score: results.readinessScore,
    readiness_tier: results.readinessTier,
    estimated_score_low: results.estimatedScoreLow,
    estimated_score_high: results.estimatedScoreHigh,
  });

  await supabase
    .from("diagnostic_attempts")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      estimated_score_low: results.estimatedScoreLow,
      estimated_score_high: results.estimatedScoreHigh,
    })
    .eq("id", attemptId);

  await persistSkillMastery(supabase, attempt.user_id as string, attempt.exam_id as string, responses);

  return results;
}

type SkillMasteryDelta = { section: string; domain: string; skill: string; correct: number; total: number };

// The cross-attempt mastery persistence that was entirely missing: without
// this, diagnostic_results.weakest_skills/strongest_skills are a snapshot
// on one attempt row that nothing ever aggregates. Reads whatever prior
// row exists for (user, exam, skill) and folds this attempt's counts in,
// rather than overwriting -- mastery is evidence accumulated across every
// attempt a student has ever taken on this exam, not just the latest one.
async function persistSkillMastery(
  supabase: SupabaseClient,
  userId: string,
  examId: string,
  responses: ResponseForResults[]
): Promise<void> {
  const bySkill = new Map<string, SkillMasteryDelta>();
  for (const r of responses) {
    const key = r.question.skill;
    const entry = bySkill.get(key) || { section: r.section, domain: r.question.domain, skill: r.question.skill, correct: 0, total: 0 };
    entry.total += 1;
    if (r.is_correct) entry.correct += 1;
    bySkill.set(key, entry);
  }
  if (bySkill.size === 0) return;

  const skills = Array.from(bySkill.keys());
  const { data: existingRows } = await supabase
    .from("diagnostic_skill_mastery")
    .select("skill, attempts_count, correct_count")
    .eq("user_id", userId)
    .eq("exam_id", examId)
    .in("skill", skills);

  const existingBySkill = new Map((existingRows || []).map((r) => [r.skill as string, r]));
  const now = new Date().toISOString();

  const upsertRows = Array.from(bySkill.values()).map((delta) => {
    const existing = existingBySkill.get(delta.skill);
    const attemptsCount = (existing?.attempts_count || 0) + delta.total;
    const correctCount = (existing?.correct_count || 0) + delta.correct;
    return {
      user_id: userId,
      exam_id: examId,
      section: delta.section,
      domain: delta.domain,
      skill: delta.skill,
      mastery_score: Math.round((((correctCount + 1) / (attemptsCount + 2)) * 100) * 10) / 10,
      is_estimate: attemptsCount < MIN_ATTEMPTS_FOR_HIGH_TIER,
      attempts_count: attemptsCount,
      correct_count: correctCount,
      last_attempt_at: now,
    };
  });

  const { error } = await supabase
    .from("diagnostic_skill_mastery")
    .upsert(upsertRows, { onConflict: "user_id,exam_id,skill" });

  if (error) {
    // Mastery persistence failing must never take down attempt finalization
    // (the student still gets their results) -- log and move on.
    console.error(`Failed to persist skill mastery: ${error.message}`);
  }
}

// Quick Diagnostic doesn't have an official College Board spec to mirror --
// it's StudyClash's own shorter, balanced sample. Sized so the two
// sections together land inside the spec's "approximately 35-45 minutes"
// target, using the same rough per-question pace as the real Digital SAT
// (~1.2 min/RW question, ~1.6 min/Math question) rather than an arbitrary
// round number.
export const QUICK_MODE_QUESTION_COUNTS: Record<string, number> = {
  reading_writing: 14,
  math: 10,
};

export const QUICK_MODE_TIME_LIMIT_MINUTES: Record<string, number> = {
  reading_writing: 18,
  math: 18,
};

export type ResponseForResults = {
  question_id: string;
  selected_answer: string | null;
  is_correct: boolean | null;
  response_time_seconds: number | null;
  flagged: boolean;
  section: string;
  module: number;
  question: {
    domain: string;
    skill: string;
    difficulty: DifficultyLabel;
    correct_answer: string;
    explanation: string;
    question_text: string;
  };
};

type SkillAggregate = {
  skill: string;
  domain: string;
  correct: number;
  total: number;
};

function accuracyPercent(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;
}

// Flags responses as an unusually-fast guess or an unusually-slow answer
// relative to that section's own median pace, rather than a fixed global
// cutoff -- Math and Reading & Writing have very different realistic paces,
// and a single hardcoded threshold would misfire on one of them.
function computePacingFlags(responses: ResponseForResults[]): {
  guessedTooQuickly: string[];
  spentTooLong: string[];
} {
  const times = responses
    .map((r) => r.response_time_seconds)
    .filter((t): t is number => typeof t === "number" && t > 0)
    .sort((a, b) => a - b);

  if (times.length === 0) return { guessedTooQuickly: [], spentTooLong: [] };

  const median = times[Math.floor(times.length / 2)];
  const guessedTooQuickly: string[] = [];
  const spentTooLong: string[] = [];

  for (const response of responses) {
    const t = response.response_time_seconds;
    if (typeof t !== "number" || t <= 0) continue;
    if (t < Math.max(5, median * 0.25)) guessedTooQuickly.push(response.question_id);
    if (t > median * 3 && t > 60) spentTooLong.push(response.question_id);
  }

  return { guessedTooQuickly, spentTooLong };
}

export type CommonMistake = {
  skill: string;
  domain: string;
  missCount: number;
  exampleQuestionIds: string[];
};

export type DiagnosticResultsPayload = {
  overallAccuracy: number;
  sectionResults: Record<string, { correct: number; total: number; accuracy: number }>;
  domainResults: Record<string, { correct: number; total: number; accuracy: number }>;
  skillResults: Record<string, { domain: string; correct: number; total: number; accuracy: number }>;
  difficultyResults: Record<DifficultyLabel, { correct: number; total: number; accuracy: number }>;
  pacingResults: {
    averageSecondsPerQuestion: number;
    guessedTooQuickly: string[];
    spentTooLong: string[];
  };
  strongestSkills: { skill: string; accuracy: number; sampleSize: number; lowConfidence: boolean }[];
  weakestSkills: { skill: string; accuracy: number; sampleSize: number; lowConfidence: boolean }[];
  // Most-missed skills by raw miss COUNT, not lowest accuracy -- a skill
  // hit hard on volume (e.g. 6 misses out of 10) is a different signal from
  // "weakest skills" (which ranks by smoothed accuracy and can surface a
  // 1-miss-out-of-2 skill above it). Both are useful; neither replaces the
  // other.
  commonMistakes: CommonMistake[];
  // How much evidence backs this attempt's skill breakdown, 0-100: the
  // share of skills seen with enough samples (MIN_ATTEMPTS_FOR_HIGH_TIER)
  // to trust, not a confidence interval on any single number.
  confidenceScore: number;
  // Distinct from overallAccuracy: readiness reuses the same
  // getMasteryTier() thresholds every other mastery signal in this app
  // uses (lib/masteryTiers.ts), so "Strong" here means the same thing it
  // means on the mastery map.
  readinessScore: number;
  readinessTier: MasteryTier;
  estimatedScoreLow: number | null;
  estimatedScoreHigh: number | null;
};

export type AssignedModuleItem = {
  question: ClientSafeQuestion;
  selectedAnswer: string | null;
  flagged: boolean;
};

type AssignedQuestionJoinRow = {
  selected_answer: string | null;
  flagged: boolean;
  question: DiagnosticQuestionRow;
};

// Reads the exact set of questions already assigned to a module, from
// diagnostic_responses -- see assignModuleQuestions below for why the
// response row (not a separate "assignment" table) is the source of truth
// for "which questions belong to this module," including ones the student
// hasn't answered yet.
export async function loadAssignedModuleQuestions(
  supabase: SupabaseClient,
  attemptId: string,
  section: string,
  module: number
): Promise<AssignedModuleItem[]> {
  const { data, error } = await supabase
    .from("diagnostic_responses")
    .select(
      "selected_answer, flagged, question:diagnostic_questions(id, exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at, created_at)"
    )
    .eq("attempt_id", attemptId)
    .eq("section", section)
    .eq("module", module);

  if (error) {
    throw new Error(`Failed to load assigned questions: ${error.message}`);
  }

  return ((data || []) as unknown as AssignedQuestionJoinRow[]).map((row) => ({
    question: sanitizeQuestionForClient(row.question),
    selectedAnswer: row.selected_answer,
    flagged: row.flagged,
  }));
}

// Weak-area attempts have no section/module structure to filter on -- their
// questions can span both reading_writing and math (whichever sections the
// flagged skills happen to live in), all under module 1. Loads every
// assigned question for the attempt, full stop.
export async function loadAllAssignedQuestions(
  supabase: SupabaseClient,
  attemptId: string
): Promise<AssignedModuleItem[]> {
  const { data, error } = await supabase
    .from("diagnostic_responses")
    .select(
      "selected_answer, flagged, question:diagnostic_questions(id, exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at, created_at)"
    )
    .eq("attempt_id", attemptId);

  if (error) {
    throw new Error(`Failed to load assigned questions: ${error.message}`);
  }

  return ((data || []) as unknown as AssignedQuestionJoinRow[]).map((row) => ({
    question: sanitizeQuestionForClient(row.question),
    selectedAnswer: row.selected_answer,
    flagged: row.flagged,
  }));
}

// Assigning a module pre-inserts one diagnostic_responses row per question
// (selected_answer/is_correct null, flagged false) instead of only creating
// rows once the student answers. That makes "the set of questions in this
// module" queryable directly from diagnostic_responses -- which is what
// makes resume-after-disconnect and the question navigator (which must show
// every question, answered or not) both work without a second table.
export async function assignModuleQuestions(
  supabase: SupabaseClient,
  attemptId: string,
  section: string,
  module: number,
  questions: DiagnosticQuestionRow[]
): Promise<void> {
  if (questions.length === 0) return;

  const rows = questions.map((q) => ({
    attempt_id: attemptId,
    question_id: q.id,
    section,
    module,
  }));

  const { error } = await supabase.from("diagnostic_responses").insert(rows);
  if (error) {
    throw new Error(`Failed to assign module questions: ${error.message}`);
  }
}

export function computeDiagnosticResults(
  responses: ResponseForResults[],
  mode: AttemptMode,
  adaptivePath: Record<string, AdaptivePath>
): DiagnosticResultsPayload {
  const totalCorrect = responses.filter((r) => r.is_correct).length;
  const overallAccuracy = accuracyPercent(totalCorrect, responses.length);

  const sectionResults: DiagnosticResultsPayload["sectionResults"] = {};
  const domainAgg = new Map<string, { correct: number; total: number }>();
  const skillAgg = new Map<string, SkillAggregate>();
  const sectionResponses = new Map<string, ScoredResponse[]>();
  const difficultyAgg: Record<DifficultyLabel, { correct: number; total: number }> = {
    easy: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    hard: { correct: 0, total: 0 },
  };
  const missesBySkill = new Map<string, { domain: string; missCount: number; exampleQuestionIds: string[] }>();

  for (const response of responses) {
    const section = response.section;
    if (!sectionResults[section]) sectionResults[section] = { correct: 0, total: 0, accuracy: 0 };
    sectionResults[section].total += 1;
    if (response.is_correct) sectionResults[section].correct += 1;

    const domainKey = response.question.domain;
    const domainEntry = domainAgg.get(domainKey) || { correct: 0, total: 0 };
    domainEntry.total += 1;
    if (response.is_correct) domainEntry.correct += 1;
    domainAgg.set(domainKey, domainEntry);

    const skillKey = response.question.skill;
    const skillEntry = skillAgg.get(skillKey) || { skill: skillKey, domain: domainKey, correct: 0, total: 0 };
    skillEntry.total += 1;
    if (response.is_correct) skillEntry.correct += 1;
    skillAgg.set(skillKey, skillEntry);

    const difficultyEntry = difficultyAgg[response.question.difficulty];
    difficultyEntry.total += 1;
    if (response.is_correct) difficultyEntry.correct += 1;

    if (response.is_correct === false) {
      const missEntry = missesBySkill.get(skillKey) || { domain: domainKey, missCount: 0, exampleQuestionIds: [] };
      missEntry.missCount += 1;
      if (missEntry.exampleQuestionIds.length < 3) missEntry.exampleQuestionIds.push(response.question_id);
      missesBySkill.set(skillKey, missEntry);
    }

    const sectionScored = sectionResponses.get(section) || [];
    sectionScored.push({ difficulty: response.question.difficulty, isCorrect: !!response.is_correct });
    sectionResponses.set(section, sectionScored);
  }

  Object.keys(sectionResults).forEach((section) => {
    const entry = sectionResults[section];
    entry.accuracy = accuracyPercent(entry.correct, entry.total);
  });

  const domainResults: DiagnosticResultsPayload["domainResults"] = {};
  domainAgg.forEach((value, key) => {
    domainResults[key] = { ...value, accuracy: accuracyPercent(value.correct, value.total) };
  });

  const skillResults: DiagnosticResultsPayload["skillResults"] = {};
  skillAgg.forEach((value, key) => {
    skillResults[key] = {
      domain: value.domain,
      correct: value.correct,
      total: value.total,
      accuracy: accuracyPercent(value.correct, value.total),
    };
  });

  // A skill answered right (or wrong) on a single question shouldn't
  // outrank a skill backed by several -- raw accuracy alone would let one
  // lucky guess dominate "strongest skills" or one careless slip dominate
  // "weakest skills." Ranking instead uses Laplace-smoothed accuracy
  // ((correct + 1) / (total + 2), a standard Beta(1,1)-prior shrinkage
  // toward 50%), which pulls thin-sample skills toward the middle so
  // multi-question evidence wins ties. The UI still shows the real,
  // unsmoothed accuracy -- smoothing only affects ranking, never the
  // displayed number -- and sampleSize/lowConfidence let the results page
  // caveat anything backed by fewer than 3 questions honestly.
  const skillsWithData = Array.from(skillAgg.values()).filter((s) => s.total >= 1);
  const smoothedConfidence = (s: SkillAggregate) => (s.correct + 1) / (s.total + 2);
  const sortedByConfidence = [...skillsWithData].sort((a, b) => smoothedConfidence(b) - smoothedConfidence(a));

  const toSkillSummary = (s: SkillAggregate) => ({
    skill: s.skill,
    accuracy: accuracyPercent(s.correct, s.total),
    sampleSize: s.total,
    lowConfidence: s.total < 3,
  });

  const strongestSkills = sortedByConfidence.slice(0, 3).map(toSkillSummary);
  const weakestSkills = sortedByConfidence
    .slice()
    .reverse()
    .slice(0, 3)
    .map(toSkillSummary);

  const totalTimeSeconds = responses.reduce((sum, r) => sum + (r.response_time_seconds || 0), 0);
  const averageSecondsPerQuestion =
    responses.length > 0 ? Math.round(totalTimeSeconds / responses.length) : 0;
  const { guessedTooQuickly, spentTooLong } = computePacingFlags(responses);

  const difficultyResults: DiagnosticResultsPayload["difficultyResults"] = {
    easy: { ...difficultyAgg.easy, accuracy: accuracyPercent(difficultyAgg.easy.correct, difficultyAgg.easy.total) },
    medium: { ...difficultyAgg.medium, accuracy: accuracyPercent(difficultyAgg.medium.correct, difficultyAgg.medium.total) },
    hard: { ...difficultyAgg.hard, accuracy: accuracyPercent(difficultyAgg.hard.correct, difficultyAgg.hard.total) },
  };

  const commonMistakes: CommonMistake[] = Array.from(missesBySkill.entries())
    .map(([skill, v]) => ({ skill, domain: v.domain, missCount: v.missCount, exampleQuestionIds: v.exampleQuestionIds }))
    .sort((a, b) => b.missCount - a.missCount)
    .slice(0, 5);

  const skillsWithEnoughSamples = skillsWithData.filter((s) => s.total >= MIN_ATTEMPTS_FOR_HIGH_TIER).length;
  const confidenceScore =
    skillsWithData.length > 0 ? Math.round((skillsWithEnoughSamples / skillsWithData.length) * 100) : 0;

  const readinessTier = getMasteryTier(totalCorrect, responses.length);
  // Readiness starts from raw accuracy (the same number the results page
  // already shows) but is nudged down when confidence is thin -- a 90%
  // accuracy score built on 3 questions shouldn't read as equally "ready"
  // as the same 90% built on 60.
  const readinessScore = Math.round(overallAccuracy * (0.7 + 0.3 * (confidenceScore / 100)) * 10) / 10;

  // A weak-area retest produces no new exam score estimate -- it's a
  // targeted mastery check across whatever sections the flagged skills
  // happen to span, not a fresh full/quick diagnostic, so an RW/Math
  // composite score here would be misleading rather than informative.
  let estimatedScoreLow: number | null = null;
  let estimatedScoreHigh: number | null = null;
  if (mode !== "weak_area") {
    const rwTheta = estimateSectionTheta(sectionResponses.get("reading_writing") || []);
    const mathTheta = estimateSectionTheta(sectionResponses.get("math") || []);
    const rwRange = estimateSectionScoreRange(rwTheta, adaptivePath.reading_writing || null, mode);
    const mathRange = estimateSectionScoreRange(mathTheta, adaptivePath.math || null, mode);
    const composite = combineToCompositeRange(rwRange, mathRange);
    estimatedScoreLow = composite.low;
    estimatedScoreHigh = composite.high;
  }

  return {
    overallAccuracy,
    sectionResults,
    domainResults,
    skillResults,
    difficultyResults,
    pacingResults: { averageSecondsPerQuestion, guessedTooQuickly, spentTooLong },
    strongestSkills,
    weakestSkills,
    commonMistakes,
    confidenceScore,
    readinessScore,
    readinessTier,
    estimatedScoreLow,
    estimatedScoreHigh,
  };
}
