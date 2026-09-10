import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient, requireAuthenticatedUser } from "@/lib/server/apiUtils";
import {
  convertCurriculumQuestions,
  summarizeSkips,
  type CurriculumQuestionRow,
} from "@/lib/curriculumDeck";

export const runtime = "nodejs";

// Turn a processed course into a deck the student actually reviews.
//
// Everything upstream of this route already worked: extraction, concept
// mapping, generation, verification. What was missing was the last step --
// the generated questions lived in `curriculum_questions`, a table the study
// app never read, so an upload produced nothing a student could practice and
// nothing that entered the SM-2 schedule.
//
// This is a SYNC rather than a build. Running it again after uploading
// another document adds the new cards and leaves the existing ones alone,
// because a card carries `source_curriculum_question_id` and the review
// schedule (ease factors, streaks, intervals) hangs off the card's id.
// Delete-and-recreate would have silently reset every interval the student
// had earned, which is the kind of data loss nobody notices until their
// whole deck is due at once.

/** Cards inserted per request, so one call cannot run away with the DB. */
const MAX_CARDS_PER_SYNC = 500;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ courseId: string }> }
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.userId) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }

  const { courseId } = await context.params;
  const supabase = getServiceSupabaseClient();

  // This route runs with the service role, so RLS is not doing the
  // ownership check for us -- it has to be explicit.
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, name, subject, owner_id")
    .eq("id", courseId)
    .eq("owner_id", auth.userId)
    .maybeSingle();

  if (courseError) {
    return NextResponse.json({ error: courseError.message }, { status: 500 });
  }
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  // Only verified questions. `question_verification` exists to catch a
  // generated question that is wrong or unsupported by its source; letting a
  // pending row into a review schedule would waste the one stage whose whole
  // job is to prevent that.
  const { data: questionRows, error: questionsError } = await supabase
    .from("curriculum_questions")
    .select(
      "id, concept_id, question_text, question_type, choices, correct_answer, explanation, difficulty, common_mistake, status"
    )
    .eq("course_id", courseId)
    .eq("status", "approved");

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  const questions = (questionRows ?? []) as CurriculumQuestionRow[];
  if (questions.length === 0) {
    return NextResponse.json(
      {
        error:
          "No verified questions yet. Upload a document and let processing finish, then try again.",
        cardsAdded: 0,
      },
      { status: 409 }
    );
  }

  // Concept names become card topics, and topic is what weak-topic
  // detection and the mastery map group by -- a card with no real topic can
  // never surface as a weakness.
  const conceptIds = [...new Set(questions.map((q) => q.concept_id).filter((id): id is string => !!id))];
  const conceptNames = new Map<string, string>();
  if (conceptIds.length > 0) {
    const { data: concepts } = await supabase
      .from("concepts")
      .select("id, name")
      .in("id", conceptIds);
    for (const concept of concepts ?? []) {
      if (concept.name) conceptNames.set(concept.id, concept.name);
    }
  }

  // The supporting excerpt the pipeline already recorded, so a card can show
  // where in the student's own document the answer came from.
  const excerpts = new Map<string, string>();
  const { data: sources } = await supabase
    .from("question_sources")
    .select("question_id, supporting_excerpt")
    .in(
      "question_id",
      questions.map((q) => q.id)
    );
  for (const source of sources ?? []) {
    if (source.supporting_excerpt && !excerpts.has(source.question_id)) {
      excerpts.set(source.question_id, source.supporting_excerpt);
    }
  }

  const { cards, skipped } = convertCurriculumQuestions({
    questions,
    conceptNames,
    excerpts,
    fallbackTopic: course.name || course.subject || "Course material",
  });

  if (cards.length === 0) {
    return NextResponse.json(
      {
        error: "None of the verified questions could be turned into cards.",
        cardsAdded: 0,
        skipped: summarizeSkips(skipped),
      },
      { status: 409 }
    );
  }

  // Find the deck already built from this course, or make one.
  const { data: existingDeck } = await supabase
    .from("decks")
    .select("id")
    .eq("source_course_id", courseId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  let deckId = existingDeck?.id as string | undefined;
  let deckCreated = false;

  if (!deckId) {
    const { data: newDeck, error: deckError } = await supabase
      .from("decks")
      .insert({
        user_id: auth.userId,
        source_course_id: courseId,
        title: course.name || "Course deck",
        course_name: course.subject || course.name || "My Study",
        student_name: "Student",
        // raw_notes is the student-facing "what this deck came from" blurb,
        // not a dump of the source document -- the document itself stays in
        // storage and only bounded excerpts are ever exposed.
        raw_notes: `Built from your uploaded material in "${course.name}".`,
      })
      .select("id")
      .single();

    if (deckError || !newDeck) {
      return NextResponse.json(
        { error: deckError?.message || "Could not create the deck." },
        { status: 500 }
      );
    }
    deckId = newDeck.id;
    deckCreated = true;
  }

  // What is already in the deck, so a re-sync adds only what is new.
  const { data: existingCards } = await supabase
    .from("questions")
    .select("source_curriculum_question_id")
    .eq("deck_id", deckId)
    .not("source_curriculum_question_id", "is", null);

  const alreadyPresent = new Set(
    (existingCards ?? [])
      .map((c) => c.source_curriculum_question_id)
      .filter((id): id is string => !!id)
  );

  const newCards = cards
    .filter((card) => !alreadyPresent.has(card.source_curriculum_question_id))
    .slice(0, MAX_CARDS_PER_SYNC)
    .map((card) => ({ ...card, deck_id: deckId }));

  if (newCards.length === 0) {
    return NextResponse.json({
      deckId,
      deckCreated,
      cardsAdded: 0,
      cardsAlreadyPresent: alreadyPresent.size,
      skipped: summarizeSkips(skipped),
      message: "This deck is already up to date with the course.",
    });
  }

  const { error: insertError } = await supabase.from("questions").insert(newCards);

  if (insertError) {
    // Only clean up a deck this request created. An existing deck the
    // student has been reviewing must survive a failed sync.
    if (deckCreated) await supabase.from("decks").delete().eq("id", deckId);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    deckId,
    deckCreated,
    cardsAdded: newCards.length,
    cardsAlreadyPresent: alreadyPresent.size,
    skipped: summarizeSkips(skipped),
  });
}
