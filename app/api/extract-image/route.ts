import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getClientIpAddress,
  hashIdentifier,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import { LUNA_TASK } from "@/lib/server/aiModels";

export const runtime = "nodejs";
export const maxDuration = 60;

// Kept well under Vercel's ~4.5MB serverless request body limit -- unlike
// extract-pdf's 8MB PDF cap, an oversized image here would fail at the
// platform layer before this handler even runs.
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
// Matches extract-pdf's cap. A transcribed photo is realistically far
// shorter than this, but the ceiling keeps behavior consistent either way.
const MAX_EXTRACTED_TEXT_CHARACTERS = 120_000;
const NO_CONTENT_SENTINEL = "NO_CONTENT_FOUND";

const ACCEPTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function isImageFile(file: File): boolean {
  if (ACCEPTED_IMAGE_MIME_TYPES.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function inferMimeType(file: File): string {
  if (ACCEPTED_IMAGE_MIME_TYPES.has(file.type)) return file.type;
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".heic")) return "image/heic";
  if (lowerName.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (!auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Image extraction is not configured right now." },
        { status: 503 }
      );
    }

    const ip = getClientIpAddress(req);
    const ipHash = hashIdentifier(ip);
    // Tighter than extract-pdf's 20/60s -- vision calls cost meaningfully
    // more per request than the free text-layer extraction PDFs get.
    const rateLimit = await checkDistributedRateLimit({
      key: `extract-image:${ipHash}`,
      limit: 10,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many image extraction requests. Please try again shortly." },
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
        { error: "No image file uploaded." },
        { status: 400 }
      );
    }

    if (!isImageFile(file)) {
      return NextResponse.json(
        { error: "Please upload a JPG, PNG, WEBP, or HEIC image." },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image exceeds size limit (4MB). Try a tighter crop or lower resolution." },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUri = `data:${inferMimeType(file)};base64,${base64}`;

    const completion = await openai.chat.completions.create({
      model: LUNA_TASK.model,
      reasoning_effort: LUNA_TASK.reasoning_effort,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Transcribe this photo of study notes into clean, well-organized plain text.

The photo may contain handwriting, typed text, a diagram, a chart, or a mix. Rules:
- Preserve headings, bullet points, and structure as plain text.
- For a diagram or chart, describe each labeled part and how the parts relate to each other in words, so the description alone conveys what the diagram shows.
- Transcribe only what is visibly present. Do not add outside facts, do not guess at illegible words -- render an illegible word as [illegible] instead of inventing one.
- If the image contains no readable study content at all (blank, too blurry, not notes), respond with exactly: ${NO_CONTENT_SENTINEL}`,
            },
            {
              type: "image_url",
              image_url: { url: dataUri },
            },
          ],
        },
      ],
      max_completion_tokens: 3000,
    });

    const rawText = completion.choices[0]?.message?.content?.trim() || "";

    if (!rawText || rawText === NO_CONTENT_SENTINEL) {
      return NextResponse.json(
        { error: "Could not read any study content from this image." },
        { status: 400 }
      );
    }

    const extractedText = rawText.slice(0, MAX_EXTRACTED_TEXT_CHARACTERS);

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to extract text from this image.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
