import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  decodeXmlEntities,
  docxXmlToText,
  extractDocxPages,
  extractPptxPages,
  isLegacyOfficeFile,
  paginateParagraphs,
  pptxSlideXmlToText,
  sortByTrailingNumber,
} from "@/lib/server/curriculum/officeExtraction";

describe("decodeXmlEntities", () => {
  it("decodes the five predefined entities", () => {
    expect(decodeXmlEntities("a &lt;b&gt; &quot;c&quot; &apos;d&apos; &amp; e")).toBe(
      `a <b> "c" 'd' & e`
    );
  });

  it("decodes numeric references, which Word uses for smart quotes", () => {
    // A curly apostrophe out of Word arrives as &#8217; and would otherwise
    // reach the model as literal mojibake in every contraction.
    expect(decodeXmlEntities("don&#8217;t")).toBe("don’t");
    expect(decodeXmlEntities("caf&#xe9;")).toBe("café");
  });

  it("decodes the ampersand last so escaped entities survive", () => {
    // "&amp;lt;" means a literal "&lt;", not a "<". Decoding & first would
    // produce "<" and silently corrupt any document discussing markup.
    expect(decodeXmlEntities("&amp;lt;")).toBe("&lt;");
  });
});

describe("docxXmlToText", () => {
  it("reads runs in document order", () => {
    const xml = `<w:p><w:r><w:t>Mitochondria </w:t></w:r><w:r><w:t>are organelles.</w:t></w:r></w:p>`;
    expect(docxXmlToText(xml)).toBe("Mitochondria are organelles.");
  });

  it("keeps paragraphs on separate lines", () => {
    const xml = `<w:p><w:r><w:t>First.</w:t></w:r></w:p><w:p><w:r><w:t>Second.</w:t></w:r></w:p>`;
    expect(docxXmlToText(xml)).toBe("First.\nSecond.");
  });

  it("honours xml:space=preserve, which carries meaningful spacing", () => {
    const xml = `<w:p><w:r><w:t xml:space="preserve">a </w:t></w:r><w:r><w:t>b</w:t></w:r></w:p>`;
    expect(docxXmlToText(xml)).toBe("a b");
  });

  it("treats tabs and breaks as spacing rather than running words together", () => {
    const xml = `<w:p><w:r><w:t>Name</w:t><w:tab/><w:t>Value</w:t><w:br/><w:t>Next</w:t></w:r></w:p>`;
    expect(docxXmlToText(xml)).toBe("Name Value\nNext");
  });

  it("decodes entities inside runs", () => {
    const xml = `<w:p><w:r><w:t>H&#8322;O &amp; salt</w:t></w:r></w:p>`;
    expect(docxXmlToText(xml)).toBe("H₂O & salt");
  });

  it("returns empty for a document with no text", () => {
    expect(docxXmlToText("<w:document></w:document>")).toBe("");
  });
});

describe("pptxSlideXmlToText", () => {
  it("turns each slide paragraph into a line", () => {
    const xml = `<a:p><a:r><a:t>Photosynthesis</a:t></a:r></a:p><a:p><a:r><a:t>Light reactions</a:t></a:r></a:p>`;
    expect(pptxSlideXmlToText(xml)).toBe("Photosynthesis\nLight reactions");
  });

  it("joins runs within a bullet, which PowerPoint splits on formatting", () => {
    // Bolding one word mid-sentence splits it into separate runs; if those
    // are not rejoined the bullet arrives as fragments.
    const xml = `<a:p><a:r><a:t>ATP is </a:t></a:r><a:r><a:t>required</a:t></a:r><a:r><a:t> here.</a:t></a:r></a:p>`;
    expect(pptxSlideXmlToText(xml)).toBe("ATP is required here.");
  });

  it("drops empty placeholder shapes rather than emitting blank lines", () => {
    const xml = `<a:p><a:r><a:t>Real</a:t></a:r></a:p><a:p></a:p><a:p><a:r><a:t> </a:t></a:r></a:p>`;
    expect(pptxSlideXmlToText(xml)).toBe("Real");
  });
});

describe("sortByTrailingNumber", () => {
  it("orders slides numerically, not as strings", () => {
    // The bug this prevents is silent: slide10 sorting before slide2 gives a
    // scrambled deck, and a scrambled deck yields a concept map with the
    // wrong prerequisites -- wrong in a way that still looks plausible.
    const names = [
      "ppt/slides/slide10.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/slide1.xml",
      "ppt/slides/slide11.xml",
    ];
    expect(sortByTrailingNumber(names)).toEqual([
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/slide10.xml",
      "ppt/slides/slide11.xml",
    ]);
  });

  it("does not mutate the caller's array", () => {
    const names = ["b2.xml", "a1.xml"];
    sortByTrailingNumber(names);
    expect(names).toEqual(["b2.xml", "a1.xml"]);
  });
});

describe("isLegacyOfficeFile", () => {
  it("recognises the OLE compound-file header of a .doc", () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x01]);
    expect(isLegacyOfficeFile(ole)).toBe(true);
  });

  it("does not flag a .docx, which is a ZIP", () => {
    // "PK\x03\x04" -- every .docx and .pptx starts this way.
    expect(isLegacyOfficeFile(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe(false);
  });

  it("does not read past the end of a tiny file", () => {
    expect(isLegacyOfficeFile(Buffer.from([0xd0, 0xcf]))).toBe(false);
    expect(isLegacyOfficeFile(Buffer.alloc(0))).toBe(false);
  });
});

// The tests above prove the parsing rules against hand-written XML. These
// build actual OOXML archives and run the real extractors over them, which
// is the part that would otherwise only be verified by a person uploading a
// file and squinting at the result.
describe("real .docx and .pptx archives", () => {
  it("reads a Word document the way Word actually writes one", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Cell Respiration</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Glycolysis happens in the </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>cytoplasm</w:t></w:r><w:r><w:t> and doesn&#8217;t need oxygen.</w:t></w:r></w:p>
</w:body></w:document>`
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const pages = await extractDocxPages(buffer);

    expect(pages).toHaveLength(1);
    expect(pages[0].rawText).toContain("Cell Respiration");
    // Runs split by bold formatting must rejoin into one readable sentence,
    // with the smart apostrophe decoded.
    expect(pages[0].rawText).toContain("Glycolysis happens in the cytoplasm and doesn’t need oxygen.");
    expect(pages[0].isUnreadable).toBe(false);
  });

  it("keeps a 12-slide deck in order", async () => {
    const zip = new JSZip();
    for (let i = 1; i <= 12; i++) {
      zip.file(
        `ppt/slides/slide${i}.xml`,
        `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Slide ${i}</a:t></a:r></a:p></p:sld>`
      );
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const pages = await extractPptxPages(buffer);

    expect(pages).toHaveLength(12);
    expect(pages.map((p) => p.rawText)).toEqual(
      Array.from({ length: 12 }, (_, i) => `Slide ${i + 1}`)
    );
  });

  it("includes speaker notes, which carry the actual explanation", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>ATP yield</a:t></a:r></a:p></p:sld>`
    );
    zip.file(
      "ppt/notesSlides/notesSlide1.xml",
      `<?xml version="1.0"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>The exam asks for net ATP, not gross.</a:t></a:r></a:p></p:notes>`
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const [page] = await extractPptxPages(buffer);

    expect(page.rawText).toContain("ATP yield");
    expect(page.rawText).toContain("The exam asks for net ATP, not gross.");
  });

  it("fails clearly on an archive that is not a presentation", async () => {
    const zip = new JSZip();
    zip.file("random.txt", "nothing here");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractPptxPages(buffer)).rejects.toThrow(/no slides/i);
  });
});

describe("paginateParagraphs", () => {
  it("never splits a paragraph across pages", () => {
    const text = ["aaaa", "bbbb", "cccc"].join("\n");
    const pages = paginateParagraphs(text, 10);
    for (const page of pages) {
      for (const line of page.split("\n")) {
        expect(["aaaa", "bbbb", "cccc"]).toContain(line);
      }
    }
  });

  it("fills a page before starting the next", () => {
    const pages = paginateParagraphs(["aaaa", "bbbb", "cccc"].join("\n"), 10);
    expect(pages[0]).toBe("aaaa\nbbbb");
    expect(pages[1]).toBe("cccc");
  });

  it("keeps a short document as a single page", () => {
    expect(paginateParagraphs("Just one line.", 2600)).toEqual(["Just one line."]);
  });

  it("returns one empty page for empty input rather than no pages", () => {
    // A document with zero pages would leave the pipeline with nothing to
    // mark as processed, and the job would look stuck rather than finished.
    expect(paginateParagraphs("")).toEqual([""]);
  });

  it("survives a single paragraph longer than the page budget", () => {
    const long = "x".repeat(5000);
    expect(paginateParagraphs(long, 1000)).toEqual([long]);
  });
});
