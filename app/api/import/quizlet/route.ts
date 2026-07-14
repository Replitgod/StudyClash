import { NextRequest, NextResponse } from "next/server";
import {
  getClientIpAddress,
  getServiceSupabaseClient,
  hashIdentifier,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

// Public Quizlet study sets are readable without logging in or any API key
// -- Quizlet discontinued public API access for new developers years ago,
// so this reads the same server-rendered HTML a logged-out visitor's
// browser would. Deliberately narrow: only quizlet.com set URLs, only a
// GET, only public sets (a private set's page won't contain the terms
// this looks for, so it fails closed with a clear error instead of an
// empty/broken deck).
const QUIZLET_URL_PATTERN = /^https:\/\/(www\.)?quizlet\.com\/[0-9]+\/[a-z0-9-]+/i;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 6_000_000;
const MAX_TERMS = 60;
const MIN_TERMS = 4;

type QuizletTerm = { word: string; definition: string };

function isQuizletHostname(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "quizlet.com" || hostname === "www.quizlet.com";
  } catch {
    return false;
  }
}

async function fetchQuizletHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // A plain fetch UA gets served a stripped-down/blocked page by some
        // Quizlet edge rules; a realistic browser UA is what actually
        // returns the full page with embedded set data.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      throw new Error(`Quizlet returned ${response.status}.`);
    }

    // Redirects are followed above, but only ever to still land on
    // quizlet.com -- if a quizlet.com URL somehow redirected off-domain,
    // that response body is not something to parse or trust.
    if (!isQuizletHostname(response.url)) {
      throw new Error("Redirected away from quizlet.com.");
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error("This Quizlet page is too large to import.");
    }

    const html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      throw new Error("This Quizlet page is too large to import.");
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

// Quizlet's page embeds its set data as a JSON blob in a Next.js
// __NEXT_DATA__ script tag. The exact internal shape isn't documented and
// can change, so rather than hard-coding a path into that object, this
// walks the whole parsed tree looking for objects that look like a term
// (a pair of non-empty string fields under one of a few known key-name
// pairs Quizlet has used). More resilient to Quizlet reshuffling
// unrelated parts of that object than a fixed path would be.
const TERM_KEY_PAIRS: Array<[string, string]> = [
  ["word", "definition"],
  ["term", "definition"],
  ["front", "back"],
];

function extractTermsFromNextData(rawJson: string): QuizletTerm[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }

  const found: QuizletTerm[] = [];
  const seen = new Set<string>();
  const visited = new Set<unknown>();

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }

    const record = node as Record<string, unknown>;

    for (const [wordKey, definitionKey] of TERM_KEY_PAIRS) {
      const word = record[wordKey];
      const definition = record[definitionKey];
      if (
        typeof word === "string" &&
        typeof definition === "string" &&
        word.trim() &&
        definition.trim() &&
        // Guards against matching unrelated "front"/"back"-named fields
        // (e.g. layout config) that aren't actually flashcard text.
        word.trim().length <= 300 &&
        definition.trim().length <= 1000
      ) {
        const key = `${word.trim().toLowerCase()}::${definition.trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ word: word.trim(), definition: definition.trim() });
        }
        break;
      }
    }

    for (const value of Object.values(record)) {
      walk(value);
    }
  }

  walk(parsed);
  return found;
}

function extractTermsFromHtml(html: string): QuizletTerm[] {
  const nextDataMatch = html.match(
    /<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!nextDataMatch) return [];
  return extractTermsFromNextData(nextDataMatch[1]);
}

function extractSetTitle(html: string): string | null {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch) return null;
  // Quizlet page titles look like "Set Title Flashcards | Quizlet" -- strip
  // the site suffix so it reads as a deck title, not a browser tab title.
  return titleMatch[1]
    .replace(/\s*\|\s*Quizlet\s*$/i, "")
    .replace(/\s*Flashcards\s*$/i, "")
    .trim()
    .slice(0, 120) || null;
}

function shuffle<T>(items: T[]): T[] {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

// Builds multiple-choice questions from term/definition pairs by using
// other definitions FROM THE SAME SET as distractors. This is deliberately
// simple (no AI call, no attempt at "plausible" distractor generation) --
// a flat vocab-style deck like this doesn't need the exam-quality
// distractor work the AI generation pipeline does for uploaded notes; it
// just needs 3 other real definitions from the same set to tell apart from
// the correct one.
function buildQuestionsFromTerms(terms: QuizletTerm[]) {
  const allDefinitions = terms.map((t) => t.definition);

  return terms.map((term) => {
    const otherDefinitions = allDefinitions.filter((d) => d !== term.definition);
    const distractors = shuffle(otherDefinitions).slice(0, 3);

    const choices = shuffle([term.definition, ...distractors]);

    return {
      question_text: `What is the definition of "${term.word}"?`,
      answer_choices: choices,
      correct_answer: term.definition,
      explanation: `"${term.word}" means: ${term.definition}`,
      topic: "Imported terms",
      difficulty: "medium",
      question_type: "multiple_choice" as const,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.userId) {
      return NextResponse.json({ error: "Please log in to import a Quizlet set." }, { status: 401 });
    }

    const clientIpHash = hashIdentifier(getClientIpAddress(req));
    const rateLimit = await checkDistributedRateLimit({
      key: `import-quizlet:${auth.userId}:${clientIpHash}`,
      limit: 5,
      windowSeconds: 600,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many imports. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const body = await req.json().catch(() => null);
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const studentName = typeof body?.studentName === "string" ? body.studentName.trim().slice(0, 80) : "Student";
    const courseName = typeof body?.courseName === "string" ? body.courseName.trim().slice(0, 80) : "";

    if (!rawUrl || !QUIZLET_URL_PATTERN.test(rawUrl)) {
      return NextResponse.json(
        { error: "Please paste a valid public Quizlet set URL (e.g. quizlet.com/123456789/set-name)." },
        { status: 400 }
      );
    }

    let html: string;
    try {
      html = await fetchQuizletHtml(rawUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reach Quizlet.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const terms = extractTermsFromHtml(html).slice(0, MAX_TERMS);

    if (terms.length < MIN_TERMS) {
      return NextResponse.json(
        {
          error:
            "Could not read enough terms from this Quizlet set. It may be private, empty, or Quizlet may have changed its page format.",
        },
        { status: 422 }
      );
    }

    const setTitle = extractSetTitle(html);
    const deckTitle = setTitle || "Imported Quizlet Set";
    const resolvedCourseName = courseName || "Imported from Quizlet";
    const rawNotes = terms.map((t) => `${t.word}: ${t.definition}`).join("\n");

    const supabase = getServiceSupabaseClient();

    const { data: deckData, error: deckError } = await supabase
      .from("decks")
      .insert({
        student_name: studentName || "Student",
        course_name: resolvedCourseName,
        title: deckTitle,
        raw_notes: rawNotes,
        user_id: auth.userId,
      })
      .select()
      .single();

    if (deckError) {
      return NextResponse.json({ error: deckError.message }, { status: 500 });
    }

    const deckId = deckData.id;
    const questionsToInsert = buildQuestionsFromTerms(terms).map((q) => ({
      ...q,
      deck_id: deckId,
    }));

    const { error: questionsError } = await supabase.from("questions").insert(questionsToInsert);

    if (questionsError) {
      await supabase.from("decks").delete().eq("id", deckId);
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }

    return NextResponse.json({ deckId, termCount: terms.length, deckTitle });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
