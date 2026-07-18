import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";

// The single read this route exists to replace: a client directly querying
// processing_jobs/documents/concepts/curriculum_questions itself. Those
// tables carry no client read policy (processing_jobs can hold raw
// extracted content; curriculum_questions carries unpublished answer keys)
// -- this route is the server-computed, already-safe-to-show summary
// Section 10 calls for ("1,842 pages uploaded / 1,799 processed / 43 need
// review"), not a passthrough of the raw pipeline tables.
export async function GET(request: NextRequest, context: { params: Promise<{ courseId: string }> }) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId } = await context.params;
  const supabase = getServiceSupabaseClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id, name, subject, status, created_at")
    .eq("id", courseId)
    .eq("owner_id", auth.userId)
    .maybeSingle();

  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const [{ data: documents }, { data: concepts }, { data: coveragePlan }, { data: questionRows }, { count: activeJobs }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("id, title, source_type, processing_status, page_count, extraction_confidence, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false }),
      supabase
        .from("concepts")
        .select("id, parent_concept_id, concept_level, name, importance, difficulty, estimated_learning_minutes")
        .eq("course_id", courseId)
        .order("concept_level", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("coverage_plans")
        .select("id, total_concepts, concepts_covered, overall_coverage_percent, computed_at")
        .eq("course_id", courseId)
        .eq("status", "ready")
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("curriculum_questions").select("status").eq("course_id", courseId),
      supabase
        .from("processing_jobs")
        .select("id", { count: "exact", head: true })
        .eq("course_id", courseId)
        .in("status", ["queued", "running"]),
    ]);

  const documentList = documents || [];
  const totalPages = documentList.reduce((sum, d) => sum + (d.page_count || 0), 0);
  const documentsByStatus: Record<string, number> = {};
  for (const d of documentList) {
    documentsByStatus[d.processing_status] = (documentsByStatus[d.processing_status] || 0) + 1;
  }
  // "Needs review" mirrors document_pages.processing_status's own
  // 'needs_review'/'failed' values (Section 1) surfaced at the document
  // level via extraction_confidence, since this route doesn't walk every
  // page row -- a document under the confidence threshold is exactly the
  // set a human should look at.
  const documentsNeedingReview = documentList.filter(
    (d) => d.processing_status === "failed" || (d.extraction_confidence !== null && d.extraction_confidence < 0.6)
  ).length;

  const questionsByStatus: Record<string, number> = {};
  for (const q of questionRows || []) {
    questionsByStatus[q.status] = (questionsByStatus[q.status] || 0) + 1;
  }

  return NextResponse.json({
    course,
    documents: documentList,
    documentStats: {
      total: documentList.length,
      byStatus: documentsByStatus,
      totalPages,
      needingReview: documentsNeedingReview,
    },
    concepts: concepts || [],
    coverage: coveragePlan || null,
    questionStats: {
      total: (questionRows || []).length,
      byStatus: questionsByStatus,
    },
    activeJobs: activeJobs || 0,
  });
}
