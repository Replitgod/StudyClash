import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { loadStudyMaterial } from "@/lib/server/voice/studyContext";
import { buildTutorInstructions } from "@/lib/server/voice/instructions";
import { VOICE_TUTOR_TOOLS } from "@/lib/voice/tools";
import { createSession, selectNextConcept } from "@/lib/voice/tutorState";
import { evaluateVoiceBudget, STALE_SESSION_MS } from "@/lib/voice/budget";
import type { Difficulty, SessionOptions, SourceType, StudyStyle } from "@/lib/voice/types";

// Authorising one voice tutor session.
//
// The browser never sees OPENAI_API_KEY. It gets an *ephemeral* client
// secret, minted here, scoped to one session and expiring in a minute, and
// the persona, the tools and the student's material are baked into that
// secret server-side -- so a caller cannot rewrite the tutor's instructions
// by editing a request. They get the session we configured or nothing.
//
// This route is also the only place that decides what a student is allowed
// to be tutored on. `deckId` from the browser is a request, not a fact:
// loadStudyMaterial re-reads it filtered by user_id, and a deck belonging to
// someone else comes back as "not found".

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The cheap realtime model, deliberately.
 *
 * Realtime audio is billed per minute of speech in BOTH directions and is
 * the most expensive thing in this product by a wide margin. A tutor that
 * talks less and asks more is also better teaching, so the constraint and
 * the pedagogy point the same way.
 */
const REALTIME_MODEL = "gpt-realtime-mini";

/**
 * Shimmer, for expression rather than neutrality.
 *
 * `marin` and `cedar` are the quality picks in OpenAI's docs but they read
 * calm. VYRA is meant to sound like a friend who is enjoying this, and
 * shimmer carries pitch movement and laughter far better. (The Realtime
 * voice set is alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin,
 * cedar -- `fable` is text-to-speech only and is rejected here.)
 */
const VOICE = "shimmer";

/** Calls a student may *start* per hour. A burst guard, not the spend limit. */
const CALLS_PER_HOUR = 12;

/** The ephemeral key only has to survive long enough to open the socket. */
const SECRET_TTL_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseOptions(raw: unknown): SessionOptions {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const styles: StudyStyle[] = ["adaptive", "review_all", "weak_first", "test_me"];
  const difficulties: Difficulty[] = ["easy", "normal", "hard", "adaptive"];

  const style = styles.includes(input.style as StudyStyle)
    ? (input.style as StudyStyle)
    : "adaptive";
  const difficulty = difficulties.includes(input.difficulty as Difficulty)
    ? (input.difficulty as Difficulty)
    : "adaptive";

  const lengthRaw = input.lengthMinutes;
  const lengthMinutes =
    typeof lengthRaw === "number" && Number.isFinite(lengthRaw)
      ? Math.max(1, Math.min(30, Math.round(lengthRaw)))
      : null;

  return { style, difficulty, lengthMinutes };
}

function parseSourceType(raw: unknown): SourceType {
  const allowed: SourceType[] = ["deck", "note", "weak_topics", "open"];
  return allowed.includes(raw as SourceType) ? (raw as SourceType) : "open";
}

/**
 * Minutes of call this user has already spent today.
 *
 * Counts finished calls by their recorded duration, and unfinished ones by
 * how long ago they started -- otherwise a student could burn the budget and
 * keep it invisible simply by never letting a call close cleanly.
 */
async function minutesUsedToday(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  userId: string
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("voice_sessions")
    .select("duration_ms, started_at, status")
    .eq("user_id", userId)
    .gte("started_at", since)
    .limit(200);

  if (!data) return 0;

  const now = Date.now();
  const totalMs = data.reduce((sum: number, row: Record<string, unknown>) => {
    const recorded = Number(row.duration_ms || 0);
    if (recorded > 0) return sum + recorded;

    // Still marked live with no duration. Charge elapsed time, but never
    // more than the staleness window -- a row from a tab closed hours ago
    // should not bill the rest of the day.
    const startedAt = Date.parse(String(row.started_at || "")) || now;
    return sum + Math.min(STALE_SESSION_MS, Math.max(0, now - startedAt));
  }, 0);

  return totalMs / 60_000;
}

export async function POST(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Please log in to talk to Vyra.", kind: "auth_failed" },
      { status: 401 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Talking to Vyra is not switched on yet.", kind: "session_create_failed" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const sourceType = parseSourceType(body?.sourceType);
  const rawSourceId = typeof body?.sourceId === "string" ? body.sourceId : null;
  const options = parseOptions(body?.options);

  // An id that is not a uuid is never going to match a row, and passing it
  // to Postgres produces a 500 rather than a 404. Reject it here.
  if (rawSourceId && !UUID_RE.test(rawSourceId)) {
    return NextResponse.json(
      { error: "That material could not be found.", kind: "session_create_failed" },
      { status: 400 }
    );
  }

  const rateLimit = await checkDistributedRateLimit({
    key: `vyra-realtime:${userId}`,
    limit: CALLS_PER_HOUR,
    windowSeconds: 3600,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "You have started a lot of calls this hour. Try again shortly.",
        kind: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const supabase = getServiceSupabaseClient();

  // Budget before material: no point reading a deck for a call that cannot
  // start, and this is the cheaper query.
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  const budget = evaluateVoiceBudget({
    planId: profile?.plan ? String(profile.plan) : null,
    minutesUsedToday: await minutesUsedToday(supabase, userId),
  });

  if (!budget.allowed) {
    return NextResponse.json(
      { error: budget.reason, kind: "rate_limited" },
      { status: 429 }
    );
  }

  const { material, error: materialError } = await loadStudyMaterial({
    supabase,
    userId,
    sourceType,
    sourceId: rawSourceId,
  });

  if (materialError === "not_found" || !material) {
    return NextResponse.json(
      { error: "That material could not be found.", kind: "session_create_failed" },
      { status: 404 }
    );
  }

  // The opening question, decided here rather than by a tool call.
  //
  // This is the difference between "hello" arriving in half a second and in
  // three. Going through the tool for the first question meant two model
  // generations before the student heard a word -- one to ask what to ask,
  // another to say it -- and that gap lands squarely on the first impression,
  // where a voice tutor either feels alive or feels like software.
  //
  // The app still chooses the question; it just chooses it up front, where
  // the latency is free. The client is told which concept this was so its
  // copy of the session agrees.
  const openingSession = createSession(material.concepts, options);
  const openingConcept = selectNextConcept(openingSession, { style: options.style });

  const instructions = buildTutorInstructions({ material, options, openingConcept });

  // A student-chosen length shortens the call; it can never extend it past
  // what the budget allows.
  const maxCallMs = options.lengthMinutes
    ? Math.min(budget.maxCallMs, options.lengthMinutes * 60_000)
    : budget.maxCallMs;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const secret = await openai.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: SECRET_TTL_SECONDS },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        output_modalities: ["audio"],
        // The tutoring loop. See lib/voice/tools.ts for why these return the
        // next move rather than an acknowledgement.
        tools: VOICE_TUTOR_TOOLS,
        tool_choice: "auto",
        // A hard ceiling on one spoken turn.
        //
        // The persona asks for two sentences and mostly gets them, but
        // "mostly" is not good enough on a voice call: one rambling
        // ninety-second answer is the thing a student remembers, and they
        // cannot skim past it the way they would a wall of text. Generous
        // enough for the explain rung of the hint ladder, tight enough that
        // a monologue gets cut off rather than delivered.
        max_output_tokens: 400,
        audio: {
          input: {
            // Laptop built-in microphones are the common case and the worst
            // case: they sit next to the speakers playing her voice back.
            // near_field cleans that up before it reaches the turn detector,
            // which is where the residual echo used to trigger a false
            // interrupt and cut her off mid-sentence.
            noise_reduction: { type: "near_field" },
            // Transcribe what the student says so the call can be read as
            // well as heard -- a student who mishears an answer needs to see
            // it, and it is what makes the session reviewable afterwards.
            transcription: { model: "gpt-4o-mini-transcribe" },
            // server_vad rather than semantic_vad, on purpose.
            //
            // semantic_vad waits to judge whether the student has finished a
            // thought, which is more forgiving of mid-sentence pauses but
            // adds a beat before it reacts. This is quick-fire recall where
            // the student often answers over the top of the question, so
            // reacting to the ONSET of speech matters more than being sure
            // they are done.
            turn_detection: {
              type: "server_vad",
              // The whole barge-in behaviour: she is cut off mid-joke and
              // picks up their answer instead.
              interrupt_response: true,
              create_response: true,
              // Tuned for a laptop's built-in microphone and its speakers,
              // which is the hardest case and the common one.
              //
              // 0.45 was deaf: a normally-spoken answer never crossed it.
              // 0.25 was too hot the other way -- on a machine playing her
              // through its own speakers, the residual echo that survives
              // the browser's canceller crossed it, fired the interrupt and
              // cut her off over and over, which from the student's side is
              // indistinguishable from "she never talks".
              //
              // 0.35 sits above that residual echo and below ordinary
              // speech. It is still a guess about someone else's room, which
              // is why the call also has an explicit "send answer" that
              // bypasses detection entirely.
              threshold: 0.35,
              // Keep the audio just before the trigger, or the first
              // syllable is clipped off the transcript.
              prefix_padding_ms: 500,
              // Long enough to think mid-sentence. At 480ms she cut in
              // during the pause between "the powerhouse of..." and "...the
              // cell", which reads as talking over you.
              silence_duration_ms: 700,
              // A student who has gone quiet gets a nudge instead of dead
              // air. The persona tells her to hint, never to answer.
              idle_timeout_ms: 8000,
            },
          },
          output: { voice: VOICE },
        },
      },
    });

    // The session row is created here rather than by the client, so that a
    // call which connects and then dies without ever reporting an ending
    // still leaves a trace. Without it, abandoned calls would be invisible
    // to both the student's history and the spend budget above.
    const { data: sessionRow } = await supabase
      .from("voice_sessions")
      .insert({
        user_id: userId,
        source_type: material.sourceType,
        source_id: material.sourceId,
        source_title: material.title,
        options,
        model: REALTIME_MODEL,
        status: "live",
      })
      .select("id")
      .maybeSingle();

    return NextResponse.json({
      clientSecret: secret.value,
      model: REALTIME_MODEL,
      expiresAt: secret.expires_at,
      // Null when the table has not been migrated yet. The call still works;
      // it simply is not saved, which is the right failure order.
      sessionId: sessionRow?.id ?? null,
      title: material.title,
      courseName: material.courseName,
      concepts: material.concepts,
      // So the client can mark it asked and stay in step with the question
      // she is about to open on.
      openingConceptId: openingConcept?.id ?? null,
      maxCallMs,
      remainingMinutes: budget.remainingMinutes,
    });
  } catch (error) {
    // Never interpolate the provider's error text into a student-facing
    // message: it can carry request ids, model names and quota details.
    console.error("[voice] session create failed", {
      userId,
      sourceType,
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Could not start the call. Please try again.", kind: "session_create_failed" },
      { status: 502 }
    );
  }
}
