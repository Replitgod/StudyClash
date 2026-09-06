import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import {
  assignModuleQuestions,
  fetchPublishedPool,
  loadAssignedModuleQuestions,
  pickModule1Questions,
} from "@/lib/server/diagnosticBank";
import {
  firstSectionKey,
  moduleSize,
  parseExamBlueprint,
  sectionLabel,
} from "@/lib/examBlueprint";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    examSlug?: string;
    mode?: "quick" | "full";
  };

  if (!body.examSlug || (body.mode !== "quick" && body.mode !== "full")) {
    return NextResponse.json({ error: "examSlug and a valid mode (quick/full) are required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: exam, error: examError } = await supabase
    .from("exam_definitions")
    .select("id, slug, name, status, disclaimer, configuration")
    .eq("slug", body.examSlug)
    .single();

  if (examError || !exam) {
    return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  }

  if (exam.status !== "available") {
    return NextResponse.json({ error: `${exam.name} is not available yet.` }, { status: 400 });
  }

  // Resume an existing in-progress attempt instead of starting a duplicate
  // one -- the DB's partial unique index on (user_id, exam_id, mode) where
  // status='in_progress' backs this up, but checking first avoids ever
  // hitting that constraint from the happy path.
  const { data: existingAttempt } = await supabase
    .from("diagnostic_attempts")
    .select("id, status, current_section, current_module, adaptive_path, mode, updated_at")
    .eq("user_id", userId)
    .eq("exam_id", exam.id)
    .eq("mode", body.mode)
    .eq("status", "in_progress")
    .maybeSingle();

  // Which section comes first, how big a module is and how long it runs are
  // all read from the exam's own blueprint now. This route used to open
  // with `const FIRST_SECTION = "reading_writing"`, which is the reason
  // every exam other than the SAT was a card with nothing behind it.
  const blueprint = parseExamBlueprint(exam.configuration);
  const firstSection = firstSectionKey(blueprint);

  if (existingAttempt) {
    const items = await loadAssignedModuleQuestions(
      supabase,
      existingAttempt.id,
      existingAttempt.current_section,
      existingAttempt.current_module
    );

    const resumeTimeLimitMinutes = moduleSize(
      blueprint,
      existingAttempt.current_section,
      existingAttempt.current_module,
      existingAttempt.mode === "quick" ? "quick" : "full"
    ).minutes;

    return NextResponse.json({
      attemptId: existingAttempt.id,
      resumed: true,
      section: existingAttempt.current_section,
      sectionLabel: sectionLabel(blueprint, existingAttempt.current_section),
      module: existingAttempt.current_module,
      timeLimitMinutes: resumeTimeLimitMinutes,
      // Approximates "time already spent in this module" from when the
      // attempt row was last updated (set exactly when this module was
      // assigned) -- resuming after a disconnect picks up with whatever
      // time is left rather than granting a fresh full timer.
      moduleStartedAt: existingAttempt.updated_at,
      disclaimer: exam.disclaimer,
      items,
    });
  }

  const { questions: questionCount, minutes: timeLimitMinutes } = moduleSize(
    blueprint,
    firstSection,
    1,
    body.mode
  );

  const pool = await fetchPublishedPool(supabase, exam.id, firstSection);
  if (pool.length === 0) {
    return NextResponse.json(
      {
        error: `No published ${sectionLabel(blueprint, firstSection)} questions are available yet. Please check back soon.`,
      },
      { status: 503 }
    );
  }

  const selected = pickModule1Questions(pool, questionCount);

  const { data: attempt, error: attemptError } = await supabase
    .from("diagnostic_attempts")
    .insert({
      user_id: userId,
      exam_id: exam.id,
      mode: body.mode,
      status: "in_progress",
      current_section: firstSection,
      current_module: 1,
      adaptive_path: {},
    })
    .select("id")
    .single();

  if (attemptError || !attempt) {
    return NextResponse.json(
      { error: attemptError?.message || "Failed to start the diagnostic." },
      { status: 500 }
    );
  }

  await assignModuleQuestions(supabase, attempt.id, firstSection, 1, selected);
  const moduleStartedAt = new Date().toISOString();
  const items = await loadAssignedModuleQuestions(supabase, attempt.id, firstSection, 1);

  return NextResponse.json({
    attemptId: attempt.id,
    resumed: false,
    section: firstSection,
    // Sent rather than mapped on the client. The client used to hold a
    // two-key record of the SAT's section names, so every other exam
    // rendered its section as a database key.
    sectionLabel: sectionLabel(blueprint, firstSection),
    module: 1,
    timeLimitMinutes,
    moduleStartedAt,
    disclaimer: exam.disclaimer,
    items,
  });
}
