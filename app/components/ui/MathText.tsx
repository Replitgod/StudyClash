"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

// Not a full markdown parser -- just LaTeX-delimiter-aware ($$...$$ for
// display/block math, $...$ for inline), which is all AI-generated
// question text needs. Plain (non-STEM) question text with no $ at all
// passes straight through unchanged.
type Segment =
  | { type: "text"; content: string }
  | { type: "math"; content: string; display: boolean };

function splitMathSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  // $$...$$ must be tried before $...$ in the same alternation, or a
  // display block would get misread as two inline delimiters.
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: input.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ type: "math", content: match[1], display: true });
    } else if (match[2] !== undefined) {
      segments.push({ type: "math", content: match[2], display: false });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push({ type: "text", content: input.slice(lastIndex) });
  }

  return segments;
}

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

export function MathText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMathSegments(text), [text]);

  if (segments.length === 1 && segments[0].type === "text") {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.content}</span>
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: renderMath(segment.content, segment.display) }} />
        )
      )}
    </span>
  );
}
