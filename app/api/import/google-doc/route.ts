import { NextRequest, NextResponse } from "next/server";
import {
  getClientIpAddress,
  hashIdentifier,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

// Unlike the Quizlet/Anki importers, this one doesn't create a deck itself
// -- Google Docs/Sheets content is free-form prose/notes, the same shape
// the existing /api/generate-questions pipeline already expects, so this
// route's only job is "turn a public link into plain text notes" and hand
// that back to the client to drop into the normal /create form. That way
// the user still goes through the real subject/title/question-count/
// difficulty controls and the existing AI generation quality checks,
// instead of a second, cruder generation path bypassing all of that.
const DOC_URL_PATTERN = /^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/;
const SHEET_URL_PATTERN = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 3_000_000;
const MAX_NOTES_CHARACTERS = 120_000;

function isGoogleDocsHostname(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "docs.google.com";
  } catch {
    return false;
  }
}

async function fetchGoogleExport(exportUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(exportUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/plain, text/csv, */*" },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("This document isn't public. Set sharing to \"Anyone with the link\" and try again.");
      }
      throw new Error(`Google Docs returned ${response.status}.`);
    }

    if (!isGoogleDocsHostname(response.url)) {
      throw new Error("Redirected away from docs.google.com.");
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("This document is too large to import.");
    }

    // A redirect to Google's login/sharing-request page still returns 200,
    // so the sharing check above alone doesn't catch every private-doc
    // case -- this is the same page every time regardless of doc ID, so a
    // presence check is reliable here.
    if (text.includes("accounts.google.com") && text.includes("ServiceLogin")) {
      throw new Error("This document isn't public. Set sharing to \"Anyone with the link\" and try again.");
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// Minimal CSV -> plain text conversion (no quoted-comma/embedded-newline
// handling): good enough for a simple two-column term/definition or
// notes-style sheet, which covers the common case this exists for.
function csvToNotesText(csv: string): string {
  return csv
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()).filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.userId) {
      return NextResponse.json({ error: "Please log in to import from Google." }, { status: 401 });
    }

    const clientIpHash = hashIdentifier(getClientIpAddress(req));
    const rateLimit = await checkDistributedRateLimit({
      key: `import-google-doc:${auth.userId}:${clientIpHash}`,
      limit: 8,
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

    const docMatch = rawUrl.match(DOC_URL_PATTERN);
    const sheetMatch = !docMatch ? rawUrl.match(SHEET_URL_PATTERN) : null;

    if (!docMatch && !sheetMatch) {
      return NextResponse.json(
        {
          error:
            "Please paste a public Google Docs or Google Sheets link (e.g. docs.google.com/document/d/...).",
        },
        { status: 400 }
      );
    }

    const documentId = (docMatch || sheetMatch)![1];
    const exportUrl = docMatch
      ? `https://docs.google.com/document/d/${documentId}/export?format=txt`
      : `https://docs.google.com/spreadsheets/d/${documentId}/export?format=csv`;

    let rawText: string;
    try {
      rawText = await fetchGoogleExport(exportUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reach Google Docs.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const notes = (docMatch ? rawText : csvToNotesText(rawText)).trim().slice(0, MAX_NOTES_CHARACTERS);

    if (!notes || notes.split(/\s+/).length < 10) {
      return NextResponse.json(
        { error: "This document appears to be empty or too short to generate a quiz from." },
        { status: 422 }
      );
    }

    return NextResponse.json({ notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
