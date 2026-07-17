import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import {
  createShortTermStudyPlan,
  SHORT_TERM_PLAN_ASSESSMENT_TYPES,
  type ShortTermPlanAssessmentType,
} from "@/lib/server/studyPlanCreation";

export const runtime = "nodejs";
export const maxDuration = 30;

type GenerateShortTermPayload = {
  matchId?: string;
  assessmentType?: ShortTermPlanAssessmentType;
  assessmentName?: string;
  dueDate?: string; // yyyy-mm-dd
  goal?: string;
  minutesPerDay?: number;
};

export async function POST(request: NextRequest) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as GenerateShortTermPayload;

  if (
    !body.matchId ||
    !body.dueDate ||
    !body.assessmentType ||
    !SHORT_TERM_PLAN_ASSESSMENT_TYPES.includes(body.assessmentType)
  ) {
    return NextResponse.json(
      { error: "matchId, a valid assessmentType, and dueDate are required." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabaseClient();

  const result = await createShortTermStudyPlan({
    supabase,
    userId,
    matchId: body.matchId,
    assessmentType: body.assessmentType,
    assessmentName: body.assessmentName,
    dueDate: body.dueDate,
    minutesPerDay: body.minutesPerDay,
    goal: body.goal,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    planId: result.planId,
    alreadyExisted: result.alreadyExisted,
    nextBestAction: result.nextBestAction,
  });
}
