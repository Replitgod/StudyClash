import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import {
  getClientIpAddress,
  hashIdentifier,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";

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
    const rateLimit = await checkDistributedRateLimit({
      key: `extract-pdf:${ipHash}`,
      limit: 20,
      windowSeconds: 60,
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
        {
          error:
            "Could not find any text in this PDF. If it's a scanned or image-only document, try pasting the text directly instead.",
        },
        { status: 400 }
      );
    }

    const extractedText = rawExtractedText.slice(0, MAX_EXTRACTED_TEXT_CHARACTERS);

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    console.error("PDF extraction failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not read this PDF. Please try a different file or paste the text directly." },
      { status: 500 }
    );
  }
}