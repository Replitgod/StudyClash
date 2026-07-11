import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import {
  checkInMemoryRateLimit,
  getClientIpAddress,
  hashIdentifier,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";

export const runtime = "nodejs";

const MAX_PDF_SIZE_BYTES = 8 * 1024 * 1024;
// Matches generate-questions' MAX_NOTES_CHARACTERS -- a densely-packed PDF
// could otherwise extract to a multi-megabyte text payload with no cap.
const MAX_EXTRACTED_TEXT_CHARACTERS = 120_000;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIpAddress(req);
    const ipHash = hashIdentifier(ip);
    const rateLimit = checkInMemoryRateLimit({
      key: `extract-pdf:${ipHash}`,
      limit: 20,
      windowMs: 60_000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many PDF extraction requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No PDF file uploaded." },
        { status: 400 }
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        { error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        { error: "PDF exceeds size limit (8MB)." },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const result = await extractText(uint8Array);
    const rawExtractedText = Array.isArray(result.text)
      ? result.text.join("\n").trim()
      : String(result.text || "").trim();

    if (!rawExtractedText) {
      return NextResponse.json(
        { error: "Could not extract text from this PDF." },
        { status: 400 }
      );
    }

    const extractedText = rawExtractedText.slice(0, MAX_EXTRACTED_TEXT_CHARACTERS);

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to extract PDF text.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}