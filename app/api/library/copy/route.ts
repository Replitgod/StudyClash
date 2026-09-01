import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { isValidShareSlug } from "@/lib/shareSlug";

// Saving a shared study set into your own library.
//
// This is the half of sharing that makes it a product feature rather than a
// growth trick. A public page a stranger can only read is a brochure; a
// public page they can take, study, and then be measured on is a way into
// the actual loop -- their copy gets its own mastery history, their own weak
// topics, their own rematches, all keyed to them.
//
// It is a copy, not a reference, on purpose. Two students studying "the
// same" set must not share progress, and the person who published it must
// not be able to change or delete material out from under someone who is
// revising with it the night before an exam.

export const runtime = "nodejs";

/** A deck can be very long; copy in chunks rather than one huge insert. */
const QUESTION_INSERT_CHUNK = 200;

/** Generous, but stops a script from cloning the whole public library. */
const COPIES_PER_HOUR = 30;

export async function POST(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Please log in to save this set." },
      { status: 401 }
    );
  }

  const rateLimit = await checkDistributedRateLimit({
    key: `library-copy:${userId}`,
    limit: COPIES_PER_HOUR,
    windowSeconds: 3600,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "You have saved a lot of sets just now. Try again in a little while." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";

  // Rejected on shape before it reaches the database.
  if (!isValidShareSlug(slug)) {
    return NextResponse.json({ error: "That link is not valid." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  // `is_public` is part of the lookup, not a check after it: an unpublished
  // deck must be indistinguishable from one that never existed.
  const { data: source, error: sourceError } = await supabase
    .from("decks")
    .select("id, title, course_name, raw_notes, user_id")
    .eq("share_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (sourceError) {
    return NextResponse.json({ error: "Could not open that set. Please try again." }, { status: 500 });
  }
  if (!source) {
    return NextResponse.json({ error: "This set is no longer shared." }, { status: 404 });
  }

  if (source.user_id === userId) {
    // Their own set. Copying it would just make a duplicate they did not
    // ask for; send them to the one they already have.
    return NextResponse.json({ deckId: source.id, alreadyYours: true });
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "question_text, answer_choices, correct_answer, explanation, topic, difficulty, source_excerpt, question_type"
    )
    .eq("deck_id", source.id);

  if (questionsError) {
    return NextResponse.json({ error: "Could not open that set. Please try again." }, { status: 500 });
  }
  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: "This set has no questions in it." }, { status: 409 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: copy, error: copyError } = await supabase
    .from("decks")
    .insert({
      // student_name is the *new* owner's, never the publisher's -- the
      // public page never shows it and a copy must not carry it across.
      student_name: profile?.display_name || "Student",
      course_name: source.course_name,
      title: source.title,
      raw_notes: source.raw_notes,
      user_id: userId,
    })
    .select("id")
    .single();

  if (copyError || !copy) {
    console.error("Deck copy failed:", copyError?.message);
    return NextResponse.json({ error: "Could not save that set. Please try again." }, { status: 500 });
  }

  for (let i = 0; i < questions.length; i += QUESTION_INSERT_CHUNK) {
    const chunk = questions.slice(i, i + QUESTION_INSERT_CHUNK).map((question) => ({
      ...question,
      deck_id: copy.id,
    }));

    const { error: insertError } = await supabase.from("questions").insert(chunk);

    if (insertError) {
      // Same cleanup contract as generation: never leave a deck that opens
      // to nothing. Better no deck than a broken one in their library.
      console.error("Deck copy questions failed:", insertError.message);
      await supabase.from("questions").delete().eq("deck_id", copy.id);
      await supabase.from("decks").delete().eq("id", copy.id).eq("user_id", userId);
      return NextResponse.json({ error: "Could not save that set. Please try again." }, { status: 500 });
    }
  }

  return NextResponse.json({ deckId: copy.id, questionCount: questions.length });
}
