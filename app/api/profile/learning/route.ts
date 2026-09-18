import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { sanitizeLearnerProfile } from "@/lib/learnerProfile";
import { EXAM_TRACKS } from "@/lib/examCatalog";

export const runtime = "nodejs";

// POST /api/profile/learning
//
// Saves what the student told onboarding: level, target exam, exam date and
// daily goal. Written with the service role because the browser's grant on
// profiles is deliberately limited to display_name and roasts_enabled (see
// 20260918_01_privacy_lockdown.sql) -- a column the browser can write is a
// column any user can set to anything.

const ALLOWED_EXAMS = ["School classes", ...EXAM_TRACKS.map((track) => track.name)];

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUser(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const profile = sanitizeLearnerProfile(body, { now: Date.now(), allowedExams: ALLOWED_EXAMS });

  const supabase = getServiceSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      education_level: profile.educationLevel,
      target_exam: profile.targetExam,
      exam_date: profile.examDate,
      daily_goal: profile.dailyGoal,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", auth.userId);

  if (error) {
    // Most likely the columns from 20260918_02 are not applied yet. The
    // client keeps the answers on the device in that case.
    console.error("Saving the learner profile failed:", error.message);
    return NextResponse.json(
      { error: "We couldn't save that just now. It's kept on this device for now." },
      { status: 503 }
    );
  }

  return NextResponse.json({ profile });
}
