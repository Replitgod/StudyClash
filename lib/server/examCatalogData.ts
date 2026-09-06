import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { parseExamBlueprint, type ExamBlueprint } from "@/lib/examBlueprint";
import { EXAM_TRACKS, type ExamTrackEntry } from "@/lib/examCatalog";

// What is actually behind each exam card, read from the database.
//
// /exams used to assert what it offered from a hand-written array, and the
// assertions had drifted from the truth in both directions: it advertised
// tracks with no questions at all, and it did not know that the Digital SAT
// had a real bank sitting behind /diagnostics. A page that describes a
// product it cannot see will always end up lying eventually.
//
// So the counts and statuses come from exam_definitions and
// diagnostic_questions. Service role, because diagnostic_questions has no
// client-readable policy at all -- it holds every answer key -- and a count
// of published rows per exam is the one thing about it that is safe to show.

export type ExamTrackStatus = {
  track: ExamTrackEntry;
  /** exam_definitions.status, or null when the exam has no row. */
  examStatus: string | null;
  examName: string | null;
  disclaimer: string | null;
  publishedQuestions: number;
  blueprint: ExamBlueprint | null;
};

/**
 * The catalog, with what is really behind each entry.
 *
 * Never throws. A database that is unreachable produces a catalog with zero
 * questions everywhere, which renders as "not yet" rather than as an error
 * page -- the exam list is also a public marketing page, and a visitor
 * should see the product rather than a stack trace.
 */
export async function loadExamCatalogStatus(): Promise<ExamTrackStatus[]> {
  const empty = (): ExamTrackStatus[] =>
    EXAM_TRACKS.map((track) => ({
      track,
      examStatus: null,
      examName: null,
      disclaimer: null,
      publishedQuestions: 0,
      blueprint: null,
    }));

  try {
    const supabase = getServiceSupabaseClient();

    const { data: exams } = await supabase
      .from("exam_definitions")
      .select("id, slug, name, status, disclaimer, configuration");

    if (!exams) return empty();

    const byExamSlug = new Map(
      exams.map((exam: Record<string, unknown>) => [String(exam.slug), exam])
    );

    // One row per published question, counted in memory rather than with
    // eight separate count queries. The bank is in the low thousands and
    // this page is revalidated hourly, so the simple read wins.
    const { data: questions } = await supabase
      .from("diagnostic_questions")
      .select("exam_id")
      .eq("status", "published")
      .limit(20000);

    const countByExamId = new Map<string, number>();
    for (const row of questions || []) {
      const id = String((row as Record<string, unknown>).exam_id);
      countByExamId.set(id, (countByExamId.get(id) ?? 0) + 1);
    }

    return EXAM_TRACKS.map((track) => {
      const exam = track.examSlug ? byExamSlug.get(track.examSlug) : undefined;
      if (!exam) {
        return {
          track,
          examStatus: null,
          examName: null,
          disclaimer: null,
          publishedQuestions: 0,
          blueprint: null,
        };
      }

      return {
        track,
        examStatus: String(exam.status ?? ""),
        examName: String(exam.name ?? track.name),
        disclaimer: exam.disclaimer ? String(exam.disclaimer) : null,
        publishedQuestions: countByExamId.get(String(exam.id)) ?? 0,
        blueprint: parseExamBlueprint(exam.configuration),
      };
    });
  } catch (error) {
    console.error("[exams] catalog status unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    return empty();
  }
}

export async function loadExamTrackStatus(slug: string): Promise<ExamTrackStatus | null> {
  const catalog = await loadExamCatalogStatus();
  return catalog.find((entry) => entry.track.slug === slug) ?? null;
}
