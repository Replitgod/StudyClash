import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";

// courses is the scoping container every curriculum-engine table hangs off
// of (see the migration's deviation #2). Client-writable per its RLS
// policy (courses_owner_insert) -- this route exists mainly so creation
// can be validated/shaped server-side rather than trusting an arbitrary
// client insert payload.
export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in to create a course." }, { status: 401 });
  }

  let body: { name?: unknown; subject?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Course name is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      owner_id: auth.userId,
      name,
      subject: typeof body.subject === "string" ? body.subject.trim() || null : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ course: data }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("owner_id", auth.userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ courses: data });
}
