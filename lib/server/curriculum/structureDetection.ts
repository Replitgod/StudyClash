// Deterministic, regex-based structure pass over one page's raw text --
// Section 1 asks to "detect headings, chapters, sections, tables, diagrams,
// equations, and page numbers" as an extraction-time step, before any LLM
// touches the content. Cheap and fast enough to run on every page; a later
// stage (concept mapping, Section 5) can layer LLM-based topic/subtopic
// labeling on top without needing this pass to be perfect.

export type PageStructure = {
  chapterHeading: string | null;
  sectionHeading: string | null;
  headings: string[];
  hasTable: boolean;
  hasEquation: boolean;
  hasDiagramReference: boolean;
  detectedPageNumber: number | null;
};

const CHAPTER_PATTERN = /^\s*(chapter|unit)\s+([0-9]+|[ivxlcdm]+)\b[:\-.\s]*(.*)$/i;
const SECTION_PATTERN = /^\s*(section\s+)?(\d{1,3}(\.\d{1,3}){1,2})\b[:\-.\s]*(.*)$/i;
// A short, title-cased or ALL-CAPS standalone line is a reasonable heading
// heuristic for extracted PDF text, which usually loses font-size/bold
// information -- this is a first pass, not a claim of perfect accuracy.
const HEADING_LINE_PATTERN = /^[A-Z][A-Za-z0-9 ,'&\-:]{2,80}$/;
const TABLE_HINT_PATTERN = /\btable\s+\d+/i;
const EQUATION_HINT_PATTERN = /[=≈≠±∑∫√]|\\frac|\\sqrt/;
const DIAGRAM_HINT_PATTERN = /\b(figure|diagram|fig\.)\s*\d+/i;
const PAGE_NUMBER_PATTERN = /^\s*(\d{1,4})\s*$/;

export function detectPageStructure(pageText: string): PageStructure {
  const lines = pageText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let chapterHeading: string | null = null;
  let sectionHeading: string | null = null;
  const headings: string[] = [];
  let detectedPageNumber: number | null = null;

  for (const line of lines.slice(0, 15)) {
    const chapterMatch = line.match(CHAPTER_PATTERN);
    if (chapterMatch && !chapterHeading) {
      chapterHeading = line;
      continue;
    }

    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch && !sectionHeading) {
      sectionHeading = line;
      continue;
    }

    if (HEADING_LINE_PATTERN.test(line) && line.split(" ").length <= 10) {
      headings.push(line);
    }
  }

  // Page numbers are usually the first or last short line on a page.
  const edgeLines = [lines[0], lines[lines.length - 1]].filter(Boolean) as string[];
  for (const line of edgeLines) {
    const match = line.match(PAGE_NUMBER_PATTERN);
    if (match) {
      detectedPageNumber = Number(match[1]);
      break;
    }
  }

  return {
    chapterHeading,
    sectionHeading,
    headings: headings.slice(0, 10),
    hasTable: TABLE_HINT_PATTERN.test(pageText),
    hasEquation: EQUATION_HINT_PATTERN.test(pageText),
    hasDiagramReference: DIAGRAM_HINT_PATTERN.test(pageText),
    detectedPageNumber,
  };
}
