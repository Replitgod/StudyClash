"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import type { MathSegment } from "./mathParsing";

// The heavy half of MathText, in its own module so it can be code-split.
//
// KaTeX plus its stylesheet is the single largest thing the study screens
// were pulling in, and it shipped to every one of them whether or not a
// single question contained math -- a history deck downloaded a LaTeX
// engine to render plain prose. MathText now loads this chunk only once it
// has actually found a `$...$` or `$$...$$` in the text.

// KaTeX's renderToString is the documented way to use it outside its own
// React wrapper -- it only ever parses the LaTeX source through KaTeX's
// math grammar into SVG/MathML, so despite the dangerouslySetInnerHTML
// below, arbitrary HTML in the source text can't reach the DOM through it.
function renderMath(content: string, display: boolean): string {
  try {
    return katex.renderToString(content, { throwOnError: false, displayMode: display });
  } catch {
    // A genuinely broken KaTeX call (not just malformed LaTeX -- that's
    // already handled by throwOnError: false rendering an inline error
    // span) shouldn't blank out the rest of the question.
    return display ? `$$${content}$$` : `$${content}$`;
  }
}

export default function MathSegments({ segments }: { segments: MathSegment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.content}</span>
        ) : (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: renderMath(segment.content, segment.display) }}
          />
        )
      )}
    </>
  );
}
