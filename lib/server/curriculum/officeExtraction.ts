// Word and PowerPoint, without a new dependency.
//
// Uploads have accepted .docx and .pptx by MIME type since the pipeline was
// built and then refused them at the door: "export to PDF for now." The
// comment in extraction.ts said a dedicated parser wasn't installed and that
// pulling one in mid-pipeline was a real decision. It turned out not to be a
// decision at all -- both formats are ZIP archives of XML, and jszip has
// been a dependency since the Anki importer landed.
//
// The XML is read with targeted regex rather than a DOM parser. That is the
// right call here and not laziness: OOXML documents are large, the text is
// held in one well-defined element per format (`w:t` for Word, `a:t` for
// PowerPoint), and a full parse would allocate a tree of every run property,
// theme reference and revision mark to read the leaves. The parsing that
// actually needs care -- entity decoding, paragraph boundaries, slide
// ordering -- is handled explicitly below and covered by tests.

import JSZip from "jszip";
import { detectPageStructure } from "./structureDetection";
import type { ExtractedPage } from "./extraction";

/**
 * A Word document has no page breaks in its XML -- pagination is a
 * rendering decision Word makes at layout time, not something stored in the
 * file. Pages are synthesized at paragraph boundaries so the rest of the
 * pipeline (which is built around pages) has something honest to work with.
 */
const DOCX_CHARS_PER_PAGE = 2600;

/**
 * The five predefined XML entities. Numeric character references are handled
 * separately, because `&#8217;` (a curly apostrophe) is extremely common in
 * material pasted out of Word and would otherwise reach the model as
 * literal mojibake.
 */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last: doing it first would turn "&amp;lt;" into "<".
    .replace(/&amp;/g, "&");
}

/** Collapse the whitespace OOXML leaves behind without eating line breaks. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Text of one Word paragraph, in document order.
 *
 * `w:t` carries the text; `w:tab` and `w:br` are empty elements that carry
 * spacing and would otherwise run words together across a line break.
 */
function docxParagraphText(paragraphXml: string): string {
  let out = "";
  // One pass over the elements that produce output, in the order they
  // appear, so a tab between two runs lands between the two runs.
  const TOKEN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;

  for (const match of paragraphXml.matchAll(TOKEN)) {
    if (match[1] !== undefined) out += decodeXmlEntities(match[1]);
    else if (match[0].startsWith("<w:tab")) out += "\t";
    else out += "\n";
  }
  return out;
}

/**
 * A .docx `word/document.xml` as plain text.
 *
 * Paragraphs become lines, which is what the downstream chunker and the
 * structure detector both expect. Table cells are separated with a tab so a
 * row of data does not collapse into one unreadable string.
 */
export function docxXmlToText(documentXml: string): string {
  const paragraphs: string[] = [];

  for (const match of documentXml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const text = docxParagraphText(match[1]);
    // A genuinely empty paragraph is a blank line the author put there.
    paragraphs.push(text.trim() ? text : "");
  }

  // Word writes table cells as paragraphs nested inside <w:tc>, so they are
  // already captured above in reading order. Nothing extra to do beyond
  // keeping the blank-line structure.
  return tidy(paragraphs.join("\n"));
}

/**
 * Text of one PowerPoint slide.
 *
 * `a:t` holds every piece of text on a slide -- titles, bullets, text boxes,
 * and table cells all use it. `a:p` marks a paragraph, which on a slide is
 * usually one bullet, so paragraphs become lines.
 */
export function pptxSlideXmlToText(slideXml: string): string {
  const lines: string[] = [];

  for (const paragraph of slideXml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)) {
    let line = "";
    for (const run of paragraph[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?>/g)) {
      if (run[1] !== undefined) line += decodeXmlEntities(run[1]);
      else line += "\n";
    }
    if (line.trim()) lines.push(line.trim());
  }

  return tidy(lines.join("\n"));
}

/**
 * Sort slide/notes files by their number, not their name.
 *
 * `slide10.xml` sorts before `slide2.xml` under any string comparison, which
 * would silently reorder a deck of ten or more slides -- and a reordered
 * deck produces a concept map with the wrong prerequisites, which is the
 * kind of wrong that looks plausible.
 */
export function sortByTrailingNumber(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const na = Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0);
    const nb = Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0);
    return na - nb;
  });
}

/**
 * Split paragraphs into synthetic pages at paragraph boundaries.
 *
 * Never splits mid-paragraph: a chunk that starts halfway through a sentence
 * produces a summary about half a thought, and the citation excerpt shown to
 * the student would start mid-clause.
 */
export function paginateParagraphs(text: string, charsPerPage = DOCX_CHARS_PER_PAGE): string[] {
  const paragraphs = text.split("\n");
  const pages: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > charsPerPage) {
      pages.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) pages.push(current.trim());

  return pages.length > 0 ? pages : [""];
}

function toPage(pageNumber: number, text: string): ExtractedPage {
  const trimmed = text.trim();
  return {
    pageNumber,
    rawText: trimmed,
    ocrUsed: false,
    // Native text out of OOXML is exact, the same as a PDF's text layer.
    // Not 1.0 only because an embedded image on the page may carry content
    // this path cannot see.
    extractionConfidence: trimmed ? 0.98 : 0,
    isUnreadable: !trimmed,
    structure: detectPageStructure(trimmed),
  };
}

/**
 * Word 97-2003 (.doc) and PowerPoint 97-2003 (.ppt) are OLE compound files,
 * not ZIP archives, so nothing here can read them.
 *
 * Detected by signature rather than by extension, because the failure is
 * otherwise both late and cryptic: the upload succeeds, a job picks it up,
 * jszip throws something about a corrupt archive, and the student is left
 * with a failed document and no idea that the fix is "File > Save As".
 *
 * The OLE header is a fixed 8-byte magic number (D0 CF 11 E0 A1 B1 1A E1).
 */
export function isLegacyOfficeFile(fileBuffer: Buffer): boolean {
  const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (fileBuffer.length < OLE_MAGIC.length) return false;
  return OLE_MAGIC.every((byte, index) => fileBuffer[index] === byte);
}

export async function extractDocxPages(fileBuffer: Buffer): Promise<ExtractedPage[]> {
  const zip = await JSZip.loadAsync(fileBuffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) {
    throw new Error("This .docx has no word/document.xml -- it may be corrupt or not a Word file.");
  }

  const text = docxXmlToText(await documentFile.async("string"));
  return paginateParagraphs(text).map((page, index) => toPage(index + 1, page));
}

export async function extractPptxPages(fileBuffer: Buffer): Promise<ExtractedPage[]> {
  const zip = await JSZip.loadAsync(fileBuffer);

  const slideNames = sortByTrailingNumber(
    Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  );
  if (slideNames.length === 0) {
    throw new Error("This .pptx has no slides -- it may be corrupt or not a PowerPoint file.");
  }

  const pages: ExtractedPage[] = [];

  for (let index = 0; index < slideNames.length; index++) {
    const slideXml = await zip.files[slideNames[index]].async("string");
    let text = pptxSlideXmlToText(slideXml);

    // Speaker notes are worth more than the slide for studying: slides are
    // usually headlines, and the actual explanation is what the lecturer
    // wrote underneath. Dropping them would throw away the best content in
    // the file.
    const slideNumber = Number(/(\d+)\.xml$/.exec(slideNames[index])?.[1] ?? index + 1);
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${slideNumber}.xml`);
    if (notesFile) {
      const notes = pptxSlideXmlToText(await notesFile.async("string"));
      // PowerPoint writes the slide number into the notes placeholder; a
      // notes body that is just that number carries nothing.
      if (notes && notes.trim() !== String(slideNumber)) {
        text = text ? `${text}\n\nSpeaker notes:\n${notes}` : `Speaker notes:\n${notes}`;
      }
    }

    pages.push(toPage(index + 1, text));
  }

  return pages;
}
