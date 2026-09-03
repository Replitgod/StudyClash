import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { summarizeSession } from "@/lib/voice/sessionSummary";
import { createSession, deriveState } from "@/lib/voice/tutorState";
import { STALE_SESSION_MS } from "@/lib/voice/budget";
import type {
  AttemptRecord,
  Concept,
  ConceptProgress,
  HintLevel,
  TranscriptTurn,
  TutorSession,
  Verdict,
} from "@/lib/voice/types";

// Saving a finished call.
//
// The server never hears the audio, so the client is necessarily the source
// of truth for what happened in the room. What it sends is therefore treated
// as a claim: every field is clamped, the verdicts are checked against the
// enum, and -- importantly -- the *summary is recomputed here* from the
// attempts that are about to be stored, rather than accepted from the
// browser. That keeps the saved review and the saved attempt rows in
// agreement by construction; a client that sent a flattering summary and
// unflattering attempts would have the summary thrown away.
//
// Saving is idempotent. The finishing update is filtered on status = 'live',
// so the second call from a double-fired cleanup effect updates zero rows
// and returns the row that already exists. That is the Phase 18 "save the
// session once" requirement made structural rather than guarded by a
// boolean the component could lose on a rerender.

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TURNS = 400;
const MAX_ATTEMPTS = 300;
const MAX_CONCEPTS = 40;
const MAX_TEXT = 2000;

const VERDICTS: Verdict[] = ["correct", "partial", "incorrect", "unknown"];
const HINT_LEVELS: HintLevel[] = ["none", "nudge", "concept", "breakdown", "explain"];

function clamp(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= max ? text : text.slice(0, max);
}

function toInt(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

/**
 * Rebuild a TutorSession from what the browser sent.
 *
 * Rebuilt rather than trusted: the progress counters are recomputed by
 * replaying the attempts through the same reducer the call used, so the
 * stored numbers cannot disagree with the stored attempt rows even if the
 * client's copy had drifted.
 */
function rehydrate(body: Record<string, unknown>): {
  session: TutorSession;
  turns: TranscriptTurn[];
} {
  const rawConcepts = Array.isArray(body.concepts) ? body.concepts : [];
  const concepts: Concept[] = rawConcepts.slice(0, MAX_CONCEPTS).map((raw, index) => {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      id: clamp(entry.id, 16) || `c${index + 1}`,
      label: clamp(entry.label, 160) || "General",
      facts: [],
      priorWeak: entry.priorWeak === true,
    };
  });

  const session = createSession(concepts);

  const rawAttempts = Array.isArray(body.attempts) ? body.attempts : [];
  const progress: Record<string, ConceptProgress> = { ...session.progress };
  const attempts: AttemptRecord[] = [];

  for (const raw of rawAttempts.slice(0, MAX_ATTEMPTS)) {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const conceptId = clamp(entry.conceptId, 16);
    const row = progress[conceptId];
    if (!row) continue;

    const verdict = VERDICTS.includes(entry.verdict as Verdict)
      ? (entry.verdict as Verdict)
      : "partial";
    const hintLevel = HINT_LEVELS.includes(entry.hintLevel as HintLevel)
      ? (entry.hintLevel as HintLevel)
      : "none";
    const misconception = clamp(entry.misconception, 240) || null;

    const usedHint = hintLevel !== "none";
    const delta =
      verdict === "correct" ? (usedHint ? 1 : 2) : verdict === "partial" ? 1 : -1;

    const isMiss = verdict === "incorrect" || verdict === "unknown";

    progress[conceptId] = {
      ...row,
      asked: row.asked + 1,
      strength: Math.max(-3, Math.min(6, row.strength + delta)),
      correct: row.correct + (verdict === "correct" ? 1 : 0),
      partial: row.partial + (verdict === "partial" ? 1 : 0),
      incorrect: row.incorrect + (verdict === "incorrect" ? 1 : 0),
      unknown: row.unknown + (verdict === "unknown" ? 1 : 0),
      hintsUsed: row.hintsUsed + (usedHint ? 1 : 0),
      consecutiveMisses: isMiss
        ? row.consecutiveMisses + 1
        : verdict === "correct"
          ? 0
          : row.consecutiveMisses,
      misconceptions:
        misconception && !row.misconceptions.includes(misconception)
          ? [...row.misconceptions, misconception]
          : row.misconceptions,
      lastAskedTurn: attempts.length + 1,
    };
    progress[conceptId].state = deriveState(progress[conceptId]);

    attempts.push({
      conceptId,
      verdict,
      hintLevel,
      misconception,
      turn: attempts.length + 1,
      atMs: Math.max(0, toInt(entry.atMs)),
    });
  }

  const rawTurns = Array.isArray(body.turns) ? body.turns : [];
  const turns: TranscriptTurn[] = rawTurns
    .slice(-MAX_TURNS)
    .map((raw, index) => {
      const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      return {
        id: clamp(entry.id, 80) || `t${index}`,
        role: entry.role === "tutor" ? ("tutor" as const) : ("student" as const),
        text: clamp(entry.text, MAX_TEXT),
        atMs: Math.max(0, toInt(entry.atMs)),
      };
    })
    .filter((turn) => turn.text.length > 0);

  return {
    session: { ...session, progress, attempts, turn: attempts.length },
    turns,
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionId = clamp(body.sessionId, 64);

  if (!sessionId) {
    return NextResponse.json({ error: "A session id is required." }, { status: 400 });
  }

  const supabase = getServiceSupabaseClient();

  // Ownership: the id came from the browser, so it is filtered by user_id
  // exactly like every other write in this app. A session belonging to
  // someone else is "not found", not "forbidden".
  const { data: existing, error: lookupError } = await supabase
    .from("voice_sessions")
    .select("id, status, started_at, summary")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    console.error("[voice] session lookup failed", { message: lookupError.message });
    return NextResponse.json({ error: "Could not save this session." }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Already finished. Hand back what was saved rather than saving again --
  // a second summary generation would be both a duplicate row and a second
  // set of counters.
  if (existing.status !== "live") {
    return NextResponse.json({ ok: true, alreadySaved: true, summary: existing.summary });
  }

  const { session, turns } = rehydrate(body);

  const startedAtMs = Date.parse(String(existing.started_at || "")) || Date.now();
  const clientDuration = Math.max(0, toInt(body.durationMs));
  // Trust the shorter of the two: a client clock that is wrong (or a payload
  // that claims an hour) must not be able to inflate recorded study time,
  // and elapsed server time is the honest ceiling.
  const durationMs = Math.min(
    clientDuration || Date.now() - startedAtMs,
    Math.max(0, Date.now() - startedAtMs),
    STALE_SESSION_MS
  );

  const summary = summarizeSession(session, durationMs);

  const status = body.status === "failed" ? "failed" : "completed";

  const { error: updateError } = await supabase
    .from("voice_sessions")
    .update({
      status,
      ended_at: new Date().toISOString(),
      duration_ms: durationMs,
      summary,
      question_count: summary.stats.questionCount,
      correct_count: summary.stats.correctCount,
      partial_count: summary.stats.partialCount,
      incorrect_count: summary.stats.incorrectCount,
      hints_used: summary.stats.hintsUsed,
      concepts_mastered: summary.stats.conceptsMastered,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    // The idempotency guard. A duplicate finish updates nothing.
    .eq("status", "live");

  if (updateError) {
    console.error("[voice] session finish failed", { message: updateError.message });
    return NextResponse.json({ error: "Could not save this session." }, { status: 500 });
  }

  // Transcript and attempts are best-effort: the session row is the thing
  // that must land, and a student whose transcript failed to save should
  // still get their review rather than an error.
  if (turns.length > 0) {
    const { error } = await supabase.from("voice_turns").insert(
      turns.map((turn) => ({
        session_id: sessionId,
        speaker: turn.role,
        transcript: turn.text,
        at_ms: turn.atMs,
      }))
    );
    if (error) console.error("[voice] transcript save failed", { message: error.message });
  }

  if (session.attempts.length > 0) {
    const labelOf = (conceptId: string) =>
      session.concepts.find((c) => c.id === conceptId)?.label || conceptId;

    const { error } = await supabase.from("voice_concept_attempts").insert(
      session.attempts.map((attempt) => ({
        session_id: sessionId,
        user_id: userId,
        concept_label: labelOf(attempt.conceptId).slice(0, 160),
        verdict: attempt.verdict,
        hint_level: attempt.hintLevel,
        misconception: attempt.misconception,
        turn_index: attempt.turn,
      }))
    );
    if (error) console.error("[voice] attempts save failed", { message: error.message });
  }

  return NextResponse.json({ ok: true, summary });
}

/** The review screen, and the history list behind it. */
export async function GET(request: NextRequest) {
  const { userId } = await requireAuthenticatedUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("id");
  const supabase = getServiceSupabaseClient();

  if (sessionId) {
    const { data: session } = await supabase
      .from("voice_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const { data: turns } = await supabase
      .from("voice_turns")
      .select("speaker, transcript, at_ms")
      .eq("session_id", sessionId)
      .order("at_ms", { ascending: true })
      .limit(MAX_TURNS);

    return NextResponse.json({ session, turns: turns || [] });
  }

  const { data: sessions } = await supabase
    .from("voice_sessions")
    .select(
      "id, source_title, started_at, duration_ms, status, question_count, correct_count, summary"
    )
    .eq("user_id", userId)
    .neq("status", "live")
    .order("started_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ sessions: sessions || [] });
}
