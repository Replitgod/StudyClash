import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import {
  assignModuleQuestions,
  fetchPublishedPool,
  loadAllAssignedQuestions,
  pickWeakAreaQuestions,
} from "@/lib/server/diagnosticBank";

export const runtime = "nodejs";
export const maxDuration = 30;

// Weak-area target skills need at least this poor a persisted mastery score
// to be worth retesting -- matches lib/masteryTiers.ts's "developing" upper
// bound (below 75% is developing-or-worse), so this mode targets exactly
// the skills the mastery map itself would flag.
const WEAK_MASTERY_THRESHOLD = 75;
const MAX_TARGET_SKILLS = 6;
const QUESTIONS_PER_SKILL = 4;
const MAX_QUESTIONS = 20;
const MINUTES_PER_QUESTION = 1.5;
const MIN_TIME_LIMIT_MINUTES = 10;

const SECTIONS = ["reading_writing", "math"];

// The highest-leverage re-entry point after a diagnostic: retest ONLY the
// skills a student is actually weak in, rather than a fresh full/quick
// attempt covering everything again. Deliberately its own mode (not a
// full/quick variant) -- no section/module structure, no adaptive
// Module 2 routing, no new exam score estimate.
export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { examSlug?: string };
  if (!body.examSlug) {
    return NextResponse.json({ error: "examSlug is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: exam, error: examError } = await supabase
    .from("exam_definitions")
    .select("id, name, status, disclaimer")
    .eq("slug", body.examSlug)
    .single();

  if (examError || !exam) {
    return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  }
  if (exam.status !== "available") {
    return NextResponse.json({ error: `${exam.name} is not available yet.` }, { status: 400 });
  }

  const { data: existingAttempt } = await supabase
    .from("diagnostic_attempts")
    .select("id, target_skills, updated_at")
    .eq("user_id", userId)
    .eq("exam_id", exam.id)
    .eq("mode", "weak_area")
    .eq("status", "in_progress")
    .maybeSingle();

  if (existingAttempt) {
    const items = await loadAllAssignedQuestions(supabase, existingAttempt.id);
    const timeLimitMinutes = Math.max(MIN_TIME_LIMIT_MINUTES, Math.round(items.length * MINUTES_PER_QUESTION));
    return NextResponse.json({
      attemptId: existingAttempt.id,
      resumed: true,
      section: "weak_area",
      module: 1,
      timeLimitMinutes,
      moduleStartedAt: existingAttempt.updated_at,
      disclaimer: exam.disclaimer,
      targetSkills: existingAttempt.target_skills,
      items,
    });
  }

  let targetSkills: string[] = [];

  const { data: masteryRows } = await supabase
    .from("diagnostic_skill_mastery")
    .select("skill, mastery_score")
    .eq("user_id", userId)
    .eq("exam_id", exam.id)
    .lt("mastery_score", WEAK_MASTERY_THRESHOLD)
    .order("mastery_score", { ascending: true })
    .limit(MAX_TARGET_SKILLS);

  if (masteryRows && masteryRows.length > 0) {
    targetSkills = masteryRows.map((r) => r.skill as string);
  } else {
    // No persisted mastery yet (first diagnostic not taken, or every skill
    // is already strong) -- fall back to the most recent completed
    // attempt's weakest_skills snapshot rather than requiring a second
    // system before this mode works at all.
    const { data: lastAttempt } = await supabase
      .from("diagnostic_attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("exam_id", exam.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastAttempt) {
      const { data: lastResults } = await supabase
        .from("diagnostic_results")
        .select("weakest_skills")
        .eq("attempt_id", lastAttempt.id)
        .maybeSingle();
      targetSkills = ((lastResults?.weakest_skills as { skill: string }[] | null) || []).map((s) => s.skill);
    }
  }

  if (targetSkills.length === 0) {
    return NextResponse.json(
      { error: "No weak areas found yet -- complete a Quick or Full Diagnostic first, or great job, nothing to retest!" },
      { status: 400 }
    );
  }

  const pools = await Promise.all(SECTIONS.map((section) => fetchPublishedPool(supabase, exam.id, section)));
  const combinedPool = pools.flat();
  const selected = pickWeakAreaQuestions(combinedPool, targetSkills, QUESTIONS_PER_SKILL).slice(0, MAX_QUESTIONS);

  if (selected.length === 0) {
    return NextResponse.json(
      { error: "No published questions are available yet for your weak areas. Please check back soon." },
      { status: 503 }
    );
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .insert({
      user_id: userId,
      exam_id: exam.id,
      mode: "weak_area",
      status: "in_progress",
      current_section: "weak_area",
      current_module: 1,
      adaptive_path: {},
      target_skills: targetSkills,
    })
    .select("id")
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json({ error: attemptError?.message || "Failed to start the weak-area retest." }, { status: 500 });
  }

  // Questions span whichever real sections the flagged skills live in --
  // diagnostic_responses.section must reflect each question's TRUE
  // section (so results aggregation stays accurate), so this groups by
  // actual section rather than writing one synthetic value for every row.
  const bySection = new Map<string, typeof selected>();
  for (const q of selected) {
    const group = bySection.get(q.section) || [];
    group.push(q);
    bySection.set(q.section, group);
  }
  for (const [section, group] of bySection) {
    await assignModuleQuestions(supabase, attempt.id, section, 1, group);
  }

  const moduleStartedAt = new Date().toISOString();
  const items = await loadAllAssignedQuestions(supabase, attempt.id);
  const timeLimitMinutes = Math.max(MIN_TIME_LIMIT_MINUTES, Math.round(items.length * MINUTES_PER_QUESTION));

  return NextResponse.json({
    attemptId: attempt.id,
    resumed: false,
    section: "weak_area",
    module: 1,
    timeLimitMinutes,
    moduleStartedAt,
    disclaimer: exam.disclaimer,
    targetSkills,
    items,
  });
}
