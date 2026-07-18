import type { PageStructure } from "./structureDetection";

// "Never place thousands of pages into one AI prompt" (Section 2) applies
// just as much to a single chunk as to the whole document -- these caps
// bound every chunk's size regardless of how sparse the structural
// signals (chapter/section headings) are on a given stretch of pages.
const MAX_CHUNK_CHARS = 3500;
const MAX_CHUNK_PAGES = 3;

export type PageForChunking = {
  pageNumber: number;
  rawText: string;
  structure: PageStructure;
  extractionConfidence: number;
  isUnreadable: boolean;
};

export type ChunkDraft = {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  chapter: string | null;
  section: string | null;
  heading: string | null;
  chunkType: "chapter" | "section" | "heading" | "paragraph";
  content: string;
  extractionConfidence: number;
};

// Groups extracted pages into chunks along structural boundaries (Section
// 2: chapter/section/heading/paragraph/page-range), falling back to a
// hard size cap for long unstructured stretches. This is a deterministic,
// non-LLM pass -- Section 5's concept mapping is what layers semantic
// topic/subtopic labels onto these chunks afterward; this stage only
// decides where chunk boundaries go.
export function chunkDocumentPages(pages: PageForChunking[]): ChunkDraft[] {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const chunks: ChunkDraft[] = [];

  let buffer: { pages: PageForChunking[]; chapter: string | null; section: string | null; heading: string | null } = {
    pages: [],
    chapter: null,
    section: null,
    heading: null,
  };

  const flush = () => {
    if (buffer.pages.length === 0) return;
    const readablePages = buffer.pages.filter((p) => !p.isUnreadable && p.rawText.trim());
    if (readablePages.length === 0) {
      buffer = { pages: [], chapter: null, section: null, heading: null };
      return;
    }

    const content = readablePages.map((p) => p.rawText.trim()).join("\n\n");
    const avgConfidence =
      readablePages.reduce((sum, p) => sum + p.extractionConfidence, 0) / readablePages.length;

    chunks.push({
      chunkIndex: chunks.length,
      pageStart: buffer.pages[0].pageNumber,
      pageEnd: buffer.pages[buffer.pages.length - 1].pageNumber,
      chapter: buffer.chapter,
      section: buffer.section,
      heading: buffer.heading,
      chunkType: buffer.chapter && buffer.pages[0].structure.chapterHeading ? "chapter" : buffer.section ? "section" : buffer.heading ? "heading" : "paragraph",
      content,
      extractionConfidence: avgConfidence,
    });

    buffer = { pages: [], chapter: null, section: null, heading: null };
  };

  let runningChars = 0;
  let currentChapter: string | null = null;
  let currentSection: string | null = null;

  for (const page of sorted) {
    const { chapterHeading, sectionHeading, headings } = page.structure;

    // A new chapter or section heading is a hard boundary -- always start
    // a fresh chunk, never merge across a structural break even if the
    // running buffer is small.
    const isNewStructuralBoundary =
      (chapterHeading && chapterHeading !== currentChapter) || (sectionHeading && sectionHeading !== currentSection);

    if (isNewStructuralBoundary && buffer.pages.length > 0) {
      flush();
      runningChars = 0;
    }

    // A new chapter resets the section context -- a section label from the
    // previous chapter must never carry over onto pages in the next one.
    if (chapterHeading && chapterHeading !== currentChapter) {
      currentChapter = chapterHeading;
      currentSection = null;
    }
    if (sectionHeading) currentSection = sectionHeading;

    if (buffer.pages.length === 0) {
      buffer.chapter = currentChapter;
      buffer.section = currentSection;
      buffer.heading = headings[0] || null;
    }

    buffer.pages.push(page);
    runningChars += page.rawText.length;

    // Soft cap: size or page-count ceiling reached with no structural
    // signal to break on -- flush at the current page boundary rather than
    // letting an unstructured run grow unbounded.
    if (runningChars >= MAX_CHUNK_CHARS || buffer.pages.length >= MAX_CHUNK_PAGES) {
      flush();
      runningChars = 0;
    }
  }

  flush();

  return chunks;
}
