import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";

// "Open any concept -> its questions -> its explanation" (Section 10). Only
// ever reachable for a concept's OWN course -- the courseId in the path is
// the ownership check, not just routing sugar.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseId: string; conceptId: string }> }
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId, conceptId } = await context.params;
  const supabase = getServiceSupabaseClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("owner_id", auth.userId)
    .maybeSingle();
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const { data: concept } = await supabase
    .from("concepts")
    .select("id, name, description, concept_level, importance, difficulty, common_mistakes, supporting_pages")
    .eq("id", conceptId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!concept) {
    return NextResponse.json({ error: "Concept not found." }, { status: 404 });
  }

  const { data: questions, error } = await supabase
    .from("curriculum_questions")
    .select(
      "id, question_text, question_type, cognitive_level, choices, correct_answer, explanation, difficulty, status, verification_score, created_at"
    )
    .eq("concept_id", conceptId)
    .neq("status", "rejected")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ concept, questions: questions || [] });
}
