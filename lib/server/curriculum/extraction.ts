import OpenAI from "openai";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { LUNA_TASK } from "@/lib/server/aiModels";
import { detectPageStructure, type PageStructure } from "./structureDetection";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// A page whose native text layer yields less than this many characters is
// treated as "no usable text layer" and gets the OCR fallback -- Section 1:
// "Use OCR only when needed," not on every page unconditionally (that would
// multiply cost/time across a 1,200-page textbook for no benefit on pages
// that already have a clean text layer).
const MIN_NATIVE_TEXT_CHARS = 40;

export type ExtractedPage = {
  pageNumber: number;
  rawText: string;
  ocrUsed: boolean;
  extractionConfidence: number;
  isUnreadable: boolean;
  structure: PageStructure;
};

async function ocrPageImage(pngBytes: Uint8Array): Promise<{ text: string; confidence: number }> {
  const base64 = Buffer.from(pngBytes).toString("base64");
  const dataUri = `data:image/png;base64,${base64}`;

  const completion = await openai.chat.completions.create({
    model: LUNA_TASK.model,
    reasoning_effort: LUNA_TASK.reasoning_effort,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Transcribe this scanned textbook/document page into clean plain text.

Rules:
- Preserve headings, bullet points, and paragraph structure.
- For a diagram, chart, or figure, describe each labeled part and how the parts relate, in words.
- Transcribe only what is visibly present. Never invent or guess at illegible text -- render it as [illegible] instead.
- If the page has no readable content at all (blank page, cover art with no text), respond with exactly: NO_CONTENT_FOUND`,
          },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    max_completion_tokens: 3000,
  });

  const text = completion.choices[0]?.message?.content?.trim() || "";
  if (!text || text === "NO_CONTENT_FOUND") {
    return { text: "", confidence: 0 };
  }
  // OCR transcription is inherently less certain than a native text layer --
  // recorded as a fixed, conservative confidence rather than 1.0, so
  // downstream consumers (coverage engine, question generation) can weight
  // OCR'd pages appropriately. Not a measured value; a deliberate default.
  return { text, confidence: 0.75 };
}

// Split into two phases so a 1,200-page textbook can be ingested across
// multiple worker invocations instead of one giant call:
//
// Phase 1 (extractPdfNativeTextPass): pure local PDF parsing, no network
// calls -- fast regardless of page count, so it always runs to completion
// in a single invocation. Pages with a usable text layer are done after
// this; pages without one are flagged needsOcr and left with empty text.
//
// Phase 2 (ocrSinglePdfPage): one page at a time, each call rendering that
// page to an image and running it through vision OCR (a real network call
// with real latency/cost). The worker calls this in small batches across
// as many invocations as it takes, tracking which page numbers are still
// pending in the processing_jobs row -- this is what makes OCR-heavy
// scanned documents resumable rather than needing to finish in one shot.

export async function extractPdfNativeTextPass(
  fileBuffer: Buffer
): Promise<{ totalPages: number; pages: ExtractedPage[]; pagesNeedingOcr: number[] }> {
  const uint8Array = new Uint8Array(fileBuffer);
  const { totalPages, text: pageTexts } = await extractText(uint8Array, { mergePages: false });

  const pages: ExtractedPage[] = [];
  const pagesNeedingOcr: number[] = [];

  for (let i = 0; i < totalPages; i++) {
    const pageNumber = i + 1;
    const nativeText = (pageTexts[i] || "").trim();

    if (nativeText.length >= MIN_NATIVE_TEXT_CHARS) {
      pages.push({
        pageNumber,
        rawText: nativeText,
        ocrUsed: false,
        extractionConfidence: 0.98,
        isUnreadable: false,
        structure: detectPageStructure(nativeText),
      });
    } else {
      pages.push({
        pageNumber,
        rawText: "",
        ocrUsed: false,
        extractionConfidence: 0,
        isUnreadable: false, // not yet known -- OCR hasn't run
        structure: detectPageStructure(""),
      });
      pagesNeedingOcr.push(pageNumber);
    }
  }

  return { totalPages, pages, pagesNeedingOcr };
}

// Processes a small batch of page numbers in one call, sharing a single
// parsed PDF document proxy across the batch (getDocumentProxy only parses
// document structure, not per-page rendering, so this is cheap to do once
// per invocation rather than once per page). The worker decides batch size
// based on its own time budget per invocation.
export async function ocrPdfPagesBatch(fileBuffer: Buffer, pageNumbers: number[]): Promise<ExtractedPage[]> {
  const uint8Array = new Uint8Array(fileBuffer);
  const documentProxy = await getDocumentProxy(uint8Array);

  const results: ExtractedPage[] = [];
  for (const pageNumber of pageNumbers) {
    try {
      const pngArrayBuffer = await renderPageAsImage(documentProxy, pageNumber, {
        canvasImport: () => import("@napi-rs/canvas") as never,
      });
      const ocrResult = await ocrPageImage(new Uint8Array(pngArrayBuffer));

      results.push(
        !ocrResult.text
          ? {
              pageNumber,
              rawText: "",
              ocrUsed: true,
              extractionConfidence: 0,
              isUnreadable: true,
              structure: detectPageStructure(""),
            }
          : {
              pageNumber,
              rawText: ocrResult.text,
              ocrUsed: true,
              extractionConfidence: ocrResult.confidence,
              isUnreadable: false,
              structure: detectPageStructure(ocrResult.text),
            }
      );
    } catch (err) {
      console.error(`OCR fallback failed for page ${pageNumber}:`, err);
      results.push({
        pageNumber,
        rawText: "",
        ocrUsed: true,
        extractionConfidence: 0,
        isUnreadable: true,
        structure: detectPageStructure(""),
      });
    }
  }

  return results;
}

export async function extractImagePage(fileBuffer: Buffer, mimeType: string): Promise<ExtractedPage[]> {
  const base64 = fileBuffer.toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;

  const completion = await openai.chat.completions.create({
    model: LUNA_TASK.model,
    reasoning_effort: LUNA_TASK.reasoning_effort,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Transcribe this photo/image of study material into clean plain text. Preserve structure. Describe diagrams in words. Never invent illegible text -- use [illegible]. If there is no readable content, respond with exactly: NO_CONTENT_FOUND`,
          },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    max_completion_tokens: 3000,
  });

  const text = completion.choices[0]?.message?.content?.trim() || "";
  const isEmpty = !text || text === "NO_CONTENT_FOUND";

  return [
    {
      pageNumber: 1,
      rawText: isEmpty ? "" : text,
      ocrUsed: true,
      extractionConfidence: isEmpty ? 0 : 0.75,
      isUnreadable: isEmpty,
      structure: detectPageStructure(isEmpty ? "" : text),
    },
  ];
}

export function extractTextFilePage(fileBuffer: Buffer): ExtractedPage[] {
  const text = fileBuffer.toString("utf-8").trim();
  return [
    {
      pageNumber: 1,
      rawText: text,
      ocrUsed: false,
      extractionConfidence: text ? 1 : 0,
      isUnreadable: !text,
      structure: detectPageStructure(text),
    },
  ];
}

// Word/PowerPoint parsing needs a dedicated library (e.g. mammoth for
// .docx, a pptx parser for slides) that isn't installed in this project
// yet -- adding a new parsing dependency is a real decision, not something
// to silently pull in mid-pipeline. Fails the job clearly instead of
// pretending to support these types.
export function isUnsupportedForExtraction(sourceType: string): boolean {
  return sourceType === "word" || sourceType === "powerpoint" || sourceType === "web_page";
}
