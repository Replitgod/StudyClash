// Splitting question text into prose and math, with no KaTeX in sight.
//
// Deliberately separate from the component that renders it: this is what
// decides whether a given string needs the LaTeX engine at all, so it has
// to be loadable without pulling KaTeX in. Pure, and tested.

export type MathSegment =
  | { type: "text"; content: string }
  | { type: "math"; content: string; display: boolean };

/**
 * Not a full markdown parser -- just LaTeX-delimiter-aware ($$...$$ for
 * display/block math, $...$ for inline), which is all AI-generated question
 * text needs. Plain (non-STEM) question text with no $ at all comes back as
 * a single text segment.
 */
export function splitMathSegments(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
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

/** True when the text needs the LaTeX engine loading at all. */
export function hasMath(segments: MathSegment[]): boolean {
  return segments.some((segment) => segment.type === "math");
}
