import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import initSqlJs, { type Database } from "sql.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getClientIpAddress,
  getServiceSupabaseClient,
  hashIdentifier,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

// Node runtime (not Edge): sql.js needs to read its .wasm binary via fs,
// and JSZip needs a real Buffer/zlib environment.
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_FILE_BYTES = 25_000_000;
const MAX_TERMS = 80;
const MIN_TERMS = 4;
// Anki separates a note's fields with the ASCII "unit separator" byte.
const ANKI_FIELD_SEPARATOR = "\x1f";

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

// Both require.resolve("sql.js/dist/sql-wasm.wasm") and even
// require.resolve("sql.js/package.json") make Next's bundler (Turbopack)
// statically resolve the target through sql.js's package "exports" map --
// the .wasm path drags in an emscripten-generated ".loader.mjs" sibling
// with its own unresolvable dynamic require, and package.json isn't
// exposed in that exports map at all, so both crash the dev build outright
// ("Module not found"). Building the path from process.cwd() instead is
// pure runtime string concatenation, invisible to any static
// require/import analysis -- this is the standard workaround for using
// sql.js's Node build inside a bundled server framework. It relies on cwd
// being the project root at runtime, true for both `next dev` and Vercel's
// Node.js serverless functions. next.config.ts's outputFileTracingIncludes
// is what gets the actual .wasm file included in the deployed Vercel
// bundle, since this dynamic path isn't statically visible to @vercel/nft
// either.
function getSqlJs() {
  if (!sqlJsPromise) {
    const wasmPath = join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
    const nodeBuffer = readFileSync(wasmPath);
    // sql.js's types want a plain ArrayBuffer, not Node's Buffer (a Uint8Array
    // subclass whose .buffer may also be a larger, shared pool allocation) --
    // slicing to the exact byte range gives a standalone ArrayBuffer.
    const wasmBinary = nodeBuffer.buffer.slice(
      nodeBuffer.byteOffset,
      nodeBuffer.byteOffset + nodeBuffer.byteLength
    ) as ArrayBuffer;
    sqlJsPromise = initSqlJs({ wasmBinary });
  }
  return sqlJsPromise;
}

type AnkiTerm = { front: string; back: string };

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Reads the `notes` table's `flds` column (fields joined by
// ANKI_FIELD_SEPARATOR) and keeps the first two fields as front/back.
// Covers Anki's "Basic" and "Basic (and reversed card)" note types, which
// cover the large majority of simple vocab-style decks -- multi-field note
// types (e.g. cloze deletions) will still import, just using whichever
// text ends up in fields 1/2, which may not always read cleanly. That's a
// known, honest limitation of this first pass, not a silent failure.
function extractTermsFromDatabase(db: Database): AnkiTerm[] {
  const terms: AnkiTerm[] = [];
  const seen = new Set<string>();

  const result = db.exec("SELECT flds FROM notes");
  const rows = result[0]?.values || [];

  for (const row of rows) {
    const flds = row[0];
    if (typeof flds !== "string") continue;

    const fields = flds.split(ANKI_FIELD_SEPARATOR);
    const front = stripHtml(fields[0] || "");
    const back = stripHtml(fields[1] || "");

    if (!front || !back) continue;
    if (front.length > 300 || back.length > 1000) continue;

    const key = `${front.toLowerCase()}::${back.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push({ front, back });
  }

  return terms;
}

async function readSqliteBytesFromApkg(fileBuffer: Buffer): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(fileBuffer);

  // Anki has used a few container filenames across versions. anki21b is a
  // zstd-compressed variant (newer "modern" export option) this route
  // deliberately doesn't support yet -- decompressing it needs a zstd
  // dependency on top of the zip/sqlite ones already added here, and
  // Anki's classic "Support older Anki versions" export checkbox produces
  // one of the two formats below, so there's a working export path for a
  // user who hits this.
  const candidateNames = ["collection.anki21", "collection.anki2"];
  for (const name of candidateNames) {
    const entry = zip.file(name);
    if (entry) {
      return entry.async("uint8array");
    }
  }

  if (zip.file("collection.anki21b")) {
    throw new Error(
      "This .apkg uses Anki's newer compressed export format. In Anki, re-export with File > Export > \"Support older Anki versions\" checked, then try again."
    );
  }

  throw new Error("Could not find a collection database inside this .apkg file.");
}

function shuffle<T>(items: T[]): T[] {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

// Same distractor strategy as the Quizlet importer (lib logic intentionally
// duplicated rather than shared -- the two routes' input shapes, AnkiTerm
// vs QuizletTerm, differ enough that a shared helper would need a generic
// {front, back} wrapper on both sides for one ~15-line function).
function buildQuestionsFromTerms(terms: AnkiTerm[]) {
  const allBacks = terms.map((t) => t.back);

  return terms.map((term) => {
    const otherBacks = allBacks.filter((b) => b !== term.back);
    const distractors = shuffle(otherBacks).slice(0, 3);
    const choices = shuffle([term.back, ...distractors]);

    return {
      question_text: `What is the answer for "${term.front}"?`,
      answer_choices: choices,
      correct_answer: term.back,
      explanation: `"${term.front}" -> ${term.back}`,
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
      return NextResponse.json({ error: "Please log in to import an Anki deck." }, { status: 401 });
    }

    const clientIpHash = hashIdentifier(getClientIpAddress(req));
    const rateLimit = await checkDistributedRateLimit({
      key: `import-anki:${auth.userId}:${clientIpHash}`,
      limit: 5,
      windowSeconds: 600,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many imports. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    const studentName =
      typeof formData?.get("studentName") === "string" ? String(formData.get("studentName")).trim().slice(0, 80) : "Student";
    const courseName =
      typeof formData?.get("courseName") === "string" ? String(formData.get("courseName")).trim().slice(0, 80) : "";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please attach a .apkg file." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".apkg")) {
      return NextResponse.json({ error: "Please attach a valid Anki .apkg file." }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "This file is too large to import (25MB max)." }, { status: 413 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    let sqliteBytes: Uint8Array;
    try {
      sqliteBytes = await readSqliteBytesFromApkg(fileBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read this .apkg file.";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const SQL = await getSqlJs();
    let db: Database;
    try {
      db = new SQL.Database(sqliteBytes);
    } catch {
      return NextResponse.json(
        { error: "This .apkg file's database could not be read. It may be corrupted." },
        { status: 422 }
      );
    }

    let terms: AnkiTerm[];
    try {
      terms = extractTermsFromDatabase(db).slice(0, MAX_TERMS);
    } finally {
      db.close();
    }

    if (terms.length < MIN_TERMS) {
      return NextResponse.json(
        { error: "Could not read enough two-sided cards from this deck to build a battle." },
        { status: 422 }
      );
    }

    const deckTitle = file.name.replace(/\.apkg$/i, "").slice(0, 120) || "Imported Anki Deck";
    const resolvedCourseName = courseName || "Imported from Anki";
    const rawNotes = terms.map((t) => `${t.front}: ${t.back}`).join("\n");

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
