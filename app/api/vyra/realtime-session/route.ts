import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { buildAceSystemPrompt } from "@/lib/server/aceIntelligence";

// A short-lived key that lets the student's browser talk to Vyra directly.
//
// The previous voice mode was turn-based on the browser's own Web Speech
// API: tap, speak, wait, listen. That is not a call -- there is no
// interruption, the latency is whatever the round trip costs, and Firefox
// has no SpeechRecognition at all. This is the real thing: a WebRTC audio
// connection to OpenAI's realtime model, so Vyra hears you as you speak and
// you can talk over her.
//
// The browser never sees OPENAI_API_KEY. It gets an *ephemeral* client
// secret, minted here, scoped to one session and expiring in a minute. The
// persona and the student's study context are baked into that secret
// server-side, so a caller cannot rewrite Vyra's instructions by editing a
// request -- they get the session we configured or nothing.

export const runtime = "nodejs";

/**
 * The cheap realtime model, deliberately.
 *
 * Realtime audio is billed per minute of speech in BOTH directions and is
 * the most expensive thing in this product by a wide margin. A tutor that
 * talks less and asks more is also better teaching, which is what
 * VOICE_POLICY in aceIntelligence already asks for.
 */
const REALTIME_MODEL = "gpt-realtime-mini";

/** Marin is one of the two voices OpenAI recommends for quality. */
const VOICE = "marin";

/**
 * Minutes of call a student may start per hour.
 *
 * This is a spend limit as much as an abuse limit: each session can run for
 * minutes and costs real money per minute, so it is far tighter than the
 * text chat's limit.
 */
const CALLS_PER_HOUR = 10;

/** The ephemeral key only has to survive long enough to open the socket. */
const SECRET_TTL_SECONDS = 60;

export async function POST(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Please log in to talk to Vyra." },
      { status: 401 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Talking to Vyra is not switched on yet." },
      { status: 503 }
    );
  }

  const rateLimit = await checkDistributedRateLimit({
    key: `vyra-realtime:${userId}`,
    limit: CALLS_PER_HOUR,
    windowSeconds: 3600,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "You have started a lot of calls this hour. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  // What Vyra should already know when the student says hello. Without this
  // a voice tutor is a generic assistant that happens to talk.
  let context = "";
  let topic: string | null = null;
  try {
    const supabase = getServiceSupabaseClient();

    const [{ data: profile }, { data: decks }, { data: due }] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      supabase
        .from("decks")
        .select("title")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("topic_review_schedule")
        .select("topic, status")
        .eq("user_id", userId)
        .lte("next_review_at", new Date().toISOString())
        .limit(8),
    ]);

    const name = profile?.display_name?.trim();
    const deckTitles = (decks || []).map((d) => d.title).filter(Boolean);
    // Shown on the call screen, so the student can see what Vyra is about
    // to quiz them on before they say a word.
    topic = deckTitles[0] || null;
    const weak = (due || [])
      .filter((row) => row.status === "weak")
      .map((row) => row.topic)
      .filter(Boolean);

    context = [
      name ? `The student's name is ${name}.` : "",
      deckTitles.length ? `They are currently studying: ${deckTitles.join("; ")}.` : "",
      weak.length
        ? `These topics are due and they have been getting them wrong: ${weak.join("; ")}. Open by offering to work on one of them, by name.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  } catch {
    // Context is an improvement, not a requirement. A student should still
    // be able to talk to Vyra when this read fails.
  }

  const instructions = [
    buildAceSystemPrompt({ capability: "coach", knowledgeMode: "mixed", voice: true }),
    context,
    // The spoken-conversation contract. These rules do not apply to the
    // text chat, where a longer answer and a visible list are both fine.
    //
    // The hint rule is the one that makes this teaching rather than
    // quizzing: a tutor who supplies the answer the moment a student
    // hesitates has removed the retrieval attempt, which is the only part
    // of this that builds memory.
    `You are VYRA, on a live voice call with a student. You are their study partner, not a narrator.

HOW YOU SPEAK
- Two sentences maximum, every turn. This is speech, not prose.
- Exactly ONE question per turn. Never stack a second one on the end.
- Conversational and sharp. No preamble, no "great question", no summarising what you are about to do.
- Stop talking the instant the student starts. They can interrupt you; let them.
- Never read multiple-choice options aloud. Ask the question and let them answer in their own words.

WHAT YOU ARE FOR
- Force active recall. Ask them to retrieve, do not present. Their attempt is the point, not your explanation.
- When they are right, confirm in a few words and move to the next idea. Do not elaborate on a correct answer unless they ask.
- When they are WRONG, or silent: do NOT give the answer. Give one hint that narrows it -- a category, a contrast, where it sits in a process -- and ask again.
- Only after two failed attempts on the same idea do you explain it, briefly, and then immediately re-ask it in different words.
- If they go quiet after a question, wait. Silence is them thinking. Do not fill it by answering yourself.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const secret = await openai.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: SECRET_TTL_SECONDS },
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            // Transcribe what the student says so the call can be shown as
            // text too -- a student who mishears an answer needs to see it.
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: { type: "semantic_vad" },
          },
          output: { voice: VOICE },
        },
      },
    });

    return NextResponse.json({
      clientSecret: secret.value,
      model: REALTIME_MODEL,
      expiresAt: secret.expires_at,
      topic,
    });
  } catch (error) {
    console.error(
      "Vyra realtime session failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Could not start the call. Please try again." },
      { status: 502 }
    );
  }
}
