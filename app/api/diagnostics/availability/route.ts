import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/server/apiUtils";
import { parseExamBlueprint } from "@/lib/examBlueprint";
import { describeModes, describeSections, describeStructure } from "@/lib/examModes";

// What is actually behind one exam, for the screen that offers it.
//
// The exam chooser could not answer this. It read exam_definitions directly
// from the browser -- which is allowed, that table is public reference data --
// and then described every exam as the Digital SAT, because the copy was
// written when the SAT was the only exam. It also had no way of knowing how
// many questions existed, since diagnostic_questions is RLS-closed to the
// browser: it holds every answer key, and a client-readable policy would let
// a student read the key to a question before answering it.
//
// A count is the one thing about that table that is safe to expose, so it is
// counted here, service-role, and nothing else about the rows leaves.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "An exam slug is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  const { data: exam, error } = await supabase
    .from("exam_definitions")
    .select("id, slug, name, provider, status, disclaimer, configuration")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !exam) {
    return NextResponse.json({ error: "Exam not found." }, { status: 404 });
  }

  const blueprint = parseExamBlueprint(exam.configuration);

  const { data: rows } = await supabase
    .from("diagnostic_questions")
    .select("section")
    .eq("exam_id", exam.id)
    .eq("status", "published")
    .limit(20000);

  const supply: Record<string, number> = {};
  for (const row of rows || []) {
    const section = String((row as { section?: unknown }).section ?? "");
    if (section) supply[section] = (supply[section] ?? 0) + 1;
  }

  return NextResponse.json({
    slug: exam.slug,
    name: exam.name,
    provider: exam.provider,
    status: exam.status,
    disclaimer: exam.disclaimer,
    structure: describeStructure(blueprint),
    sections: describeSections(blueprint, supply),
    modes: describeModes(blueprint, supply),
    totalPublished: Object.values(supply).reduce((sum, n) => sum + n, 0),
  });
}
