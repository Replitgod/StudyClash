import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import { getMasteryTier, MASTERY_TIER_LABELS } from "@/lib/masteryTiers";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 50;

// The page that was entirely missing from the diagnostics system: nothing
// let a student compare attempts over time or see mastery trend across
// retakes. This route aggregates diagnostic_attempts/diagnostic_results
// (per-attempt history) and diagnostic_skill_mastery (the persisted,
// cross-attempt signal) into the one payload the history page needs.
export async function GET(request: NextRequest) {
  const { userId, errorResponse } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: errorResponse || "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: attempts, error: attemptsError } = await supabase
    .from("diagnostic_attempts")
    .select("id, mode, status, completed_at, exam:exam_definitions(name, slug)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(MAX_ATTEMPTS);

  if (attemptsError) {
    return NextResponse.json({ error: attemptsError.message }, { status: 500 });
  }

  const attemptIds = (attempts || []).map((a) => a.id);
  const { data: resultsRows } = attemptIds.length
    ? await supabase
        .from("diagnostic_results")
        .select("attempt_id, overall_accuracy, readiness_score, readiness_tier, estimated_score_low, estimated_score_high")
        .in("attempt_id", attemptIds)
    : { data: [] };

  const resultsByAttempt = new Map((resultsRows || []).map((r) => [r.attempt_id as string, r]));

  const attemptHistory = (attempts || []).map((a) => {
    const results = resultsByAttempt.get(a.id);
    const exam = a.exam as unknown as { name: string; slug: string } | null;
    return {
      id: a.id,
      mode: a.mode,
      completedAt: a.completed_at,
      examName: exam?.name || "Unknown exam",
      examSlug: exam?.slug || "",
      overallAccuracy: results?.overall_accuracy ?? null,
      readinessScore: results?.readiness_score ?? null,
      readinessTier: results?.readiness_tier ?? null,
      estimatedScoreLow: results?.estimated_score_low ?? null,
      estimatedScoreHigh: results?.estimated_score_high ?? null,
    };
  });

  const { data: masteryRows, error: masteryError } = await supabase
    .from("diagnostic_skill_mastery")
    .select("exam_id, section, domain, skill, mastery_score, is_estimate, attempts_count, correct_count, last_attempt_at, exam:exam_definitions(name, slug)")
    .eq("user_id", userId)
    .order("mastery_score", { ascending: true });

  if (masteryError) {
    return NextResponse.json({ error: masteryError.message }, { status: 500 });
  }

  const masteryByExam = new Map<
    string,
    {
      examName: string;
      examSlug: string;
      skills: {
        skill: string;
        domain: string;
        masteryScore: number;
        isEstimate: boolean;
        attemptsCount: number;
        lastAttemptAt: string | null;
        masteryTier: string;
        masteryTierLabel: string;
      }[];
    }
  >();
  for (const row of masteryRows || []) {
    const exam = row.exam as unknown as { name: string; slug: string } | null;
    const key = row.exam_id as string;
    if (!masteryByExam.has(key)) {
      masteryByExam.set(key, { examName: exam?.name || "Unknown exam", examSlug: exam?.slug || "", skills: [] });
    }
    // Same canonical tier function as Mastery Map and the results-page
    // ClashPath report (lib/masteryTiers.ts) -- this table already stores
    // correct_count/attempts_count precisely so this could be computed
    // consistently instead of diagnostics inventing its own thresholds.
    const masteryTier = getMasteryTier(row.correct_count, row.attempts_count);
    masteryByExam.get(key)!.skills.push({
      skill: row.skill,
      domain: row.domain,
      masteryScore: row.mastery_score,
      isEstimate: row.is_estimate,
      attemptsCount: row.attempts_count,
      lastAttemptAt: row.last_attempt_at,
      masteryTier,
      masteryTierLabel: MASTERY_TIER_LABELS[masteryTier],
    });
  }

  return NextResponse.json({
    attempts: attemptHistory,
    masteryByExam: Array.from(masteryByExam.values()),
  });
}
