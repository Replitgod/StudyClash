import { NextRequest, NextResponse } from "next/server";
import { extractText } from "unpdf";
import {
  getClientIpAddress,
  hashIdentifier,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import {
  extractDocxPages,
  extractPptxPages,
  isLegacyOfficeFile,
} from "@/lib/server/curriculum/officeExtraction";

export const runtime = "nodejs";

// Reads the text out of a document the student attached in the composer.
// Named for PDFs, which it started with; it also takes Word (.docx) and
// PowerPoint (.pptx), using the same extractors the document pipeline uses,
// so the composer accepts the files a student actually has.
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
        { error: "You've uploaded a lot of files in a minute. Wait a moment and try again." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file arrived. Please attach it again." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isDocx = name.endsWith(".docx");
    const isPptx = name.endsWith(".pptx");

    if (!isPdf && !isDocx && !isPptx) {
      return NextResponse.json(
        { error: "Attach a PDF, Word (.docx) or PowerPoint (.pptx) file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json(
        { error: "That file is over 8 MB. Try a smaller file, or paste the text in." },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    if (isDocx || isPptx) {
      const buffer = Buffer.from(arrayBuffer);
      if (isLegacyOfficeFile(buffer)) {
        return NextResponse.json(
          {
            error:
              "That's an older Office file (.doc or .ppt). Open it and use File > Save As to save it as .docx or .pptx, then attach it again.",
          },
          { status: 400 }
        );
      }
      const pages = isDocx ? await extractDocxPages(buffer) : await extractPptxPages(buffer);
      const text = pages
        .map((page) => page.rawText.trim())
        .filter(Boolean)
        .join("\n\n")
        .slice(0, MAX_EXTRACTED_TEXT_CHARACTERS);
      if (!text) {
        return NextResponse.json(
          { error: "We couldn't find any text in that file. Try pasting the text in instead." },
          { status: 400 }
        );
      }
      return NextResponse.json({ text });
    }

    const uint8Array = new Uint8Array(arrayBuffer);

    const result = await extractText(uint8Array);
    const rawExtractedText = Array.isArray(result.text)
      ? result.text.join("\n").trim()
      : String(result.text || "").trim();

    if (!rawExtractedText) {
      return NextResponse.json(
        {
          error:
            "We couldn't find any text in this PDF. If it's a scan, attach a clear photo of the page instead, or paste the text in.",
        },
        { status: 400 }
      );
    }

    const extractedText = rawExtractedText.slice(0, MAX_EXTRACTED_TEXT_CHARACTERS);

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    console.error("Document extraction failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "We couldn't read that file. Try a different copy, or paste the text in." },
      { status: 500 }
    );
  }
}