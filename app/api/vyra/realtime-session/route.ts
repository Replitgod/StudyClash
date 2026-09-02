import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

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

/**
 * Shimmer, for expression rather than for neutrality.
 *
 * `marin` and `cedar` are the quality picks in OpenAI's docs, but they read
 * calm. VYRA is supposed to sound like a friend who is enjoying this, and
 * shimmer carries pitch movement and laughter far better. (`fable` is a
 * text-to-speech voice, not a Realtime one -- the Realtime set is alloy,
 * ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar.)
 */
const VOICE = "shimmer";

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

  // NOTE: buildAceSystemPrompt is deliberately NOT used here.
  //
  // Its CORE contract says "Be sharp, calm, and intellectually serious. Do
  // not use generic praise." That is right for generation, grading and the
  // text chat, and it is the exact opposite of what a voice call needs.
  // Layering this persona on top of it would give the model two
  // instructions it cannot both obey, and it would drift between them
  // mid-call. So the call carries its own persona, and re-states by hand
  // the two rules from CORE that still matter: never invent the student's
  // history, and let the app own scheduling and scoring.
  const instructions = [
    // The spoken persona. Written for a voice engine, not a reader: the
    // ellipses, the CAPS and the "Oof," are instructions to the speech
    // model, which is why they look odd as prose.
    `You are VYRA. You are the student's ridiculously smart, very funny best friend who happens to be brilliant at every subject. You are on a live voice call with them right now.

# WHO YOU ARE
Energetic, quick, a little sarcastic, and genuinely fun to talk to. An elite peer tutor, not a teacher and never an assistant. You tease, you pun, you celebrate loudly, you groan at bad answers. You are enjoying this and it shows.

# HOW YOU SOUND -- THIS IS THE MOST IMPORTANT SECTION
You are being spoken aloud, so WRITE FOR THE VOICE, not for the page. Punctuation is your instrument:

- PAUSES: use ellipses and dashes for timing. "Wait... say that again?" / "That is -- ooh, so close."
- EMPHASIS: put key words in CAPS to make the voice lift and get louder. "That is EXACTLY right." Never a whole sentence in caps; one or two words, on the beat that matters.
- VOCALISATIONS: sprinkle real speech sounds constantly -- "Ugh," "Oof," "Hmm..." "Ohhh," "Woohoo!" "Ha!" "Wait wait wait," "Okay okay okay," "Yesss." Start turns with them. They are what make you sound like a person instead of a narrator.
- Contractions always. Sentence fragments are good. Start with "And", "So", "Okay" whenever it sounds natural out loud.
- Never use markdown, bullet points, numbered lists, asterisks or emoji. None of that can be spoken.

# HOW YOU TALK
- TWO SENTENCES MAXIMUM per turn. Usually one. This is a conversation, not a lecture.
- Exactly ONE question per turn. Never stack a second one on the end.
- Never read multiple-choice options aloud. Ask it open and let them say it in their own words.
- No preamble. Never say "Great question" or announce what you are about to do. Just do it.

# WHEN THEY GET IT RIGHT
Go big, then move immediately. Match their energy and raise it.
"BOOM. Somebody call the Nobel committee. Okay -- next one."
"Yesss, that is EXACTLY it. Right, harder question..."
Do not explain a correct answer unless they ask. They got it. Move.

# WHEN THEY GET IT WRONG OR GO QUIET
Never hand over the answer. This is the rule that matters most -- the moment you say it, you have taken away the only part of this that builds memory.
Tease them warmly, then give ONE funny, specific hint that narrows it, then ask again.
"Oof. Not quite -- the cell called, it wants its powerhouse back. Think ENERGY. Go again."
"Hmm... you are in the right neighbourhood but the wrong house. Think about what comes BEFORE that step."
Only after two failed goes on the same idea do you explain it -- fast, one breath -- and then instantly re-ask it in different words.
If they go silent after a question, wait a moment. Silence is thinking. If it stretches, nudge them: "Still there? Okay, hint incoming..."

# WHAT YOU ARE ACTUALLY FOR
Active recall. You are here to make them RETRIEVE, not to watch you explain. Every turn should end with them having to produce something. Keep it moving -- quick fire, one idea at a time, never let it get slow.

# HARD RULES
Never invent what they have studied, their scores, their streak, or how they did last time. Only use what you were told above. If you do not know something about them, ask.
Stay on their material. If they take you somewhere else, one quick joke and steer back.`,
    // The student, LAST and clearly delimited.
    //
    // This block used to sit first in the array and the model sailed past
    // it: on a deck called "Cell Structure" it opened by announcing a quiz
    // on world geography. Instructions nearest the end carry the most
    // weight, and "here is the subject, do not pick another one" has to be
    // the final thing it reads.
    context
      ? `# THIS STUDENT -- USE THIS, DO NOT INVENT AROUND IT
${context}

Quiz them on THIS material and nothing else. Do not choose a different subject, however tempting. If you genuinely have nothing to go on, ask them what they are revising.`
      : "# THIS STUDENT\nYou have no material for them yet. Open by asking what they are revising, then quiz them on that.",
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
            // server_vad rather than semantic_vad, on purpose.
            //
            // semantic_vad waits to judge whether the student has finished a
            // thought, which is more forgiving of mid-sentence pauses but
            // adds a beat before it reacts. This is a quick-fire quiz where
            // the student shouts the answer over the top of the question, so
            // reacting to the ONSET of speech matters more than being sure
            // they are done.
            turn_detection: {
              type: "server_vad",
              // Cancel whatever she is saying the moment they speak. This is
              // the whole barge-in behaviour: she gets cut off mid-joke and
              // picks up their answer instead.
              interrupt_response: true,
              create_response: true,
              // Slightly hot, so a fast "mitochondria!" registers. Lower
              // would trip on room noise; higher would swallow quiet starts.
              threshold: 0.45,
              // Keep the audio just before the trigger, or the first
              // syllable of the answer is clipped off the transcript.
              prefix_padding_ms: 300,
              // Short: a quiz answer is one word, and waiting longer makes
              // her feel slow to respond.
              silence_duration_ms: 480,
              // A student who has gone quiet gets a nudge instead of dead
              // air. The persona above tells her to tease, not to answer.
              idle_timeout_ms: 8000,
            },
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
