"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { hasMath, splitMathSegments } from "./mathParsing";

// Question text, with math rendered only when there is math.
//
// KaTeX and its stylesheet were the heaviest thing on the study screens and
// they loaded on all six of them regardless of content -- a history deck
// pulled down a LaTeX engine to render plain prose. The engine now lives in
// MathSegments.tsx and is fetched on demand, the first time a string
// containing `$...$` or `$$...$$` is actually rendered.
//
// The overwhelmingly common case -- text with no math at all -- returns
// before the dynamic import is ever referenced, so those screens never
// request the chunk.
const MathSegments = dynamic(() => import("./MathSegments"), {
  ssr: false,
  // The raw source is a better placeholder than a blank: a student reading
  // "x^2 + 1" for a beat is oriented; an empty span is not.
  loading: () => null,
});

export function MathText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMathSegments(text), [text]);
  const needsKatex = useMemo(() => hasMath(segments), [segments]);

  if (!needsKatex) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      <MathSegments segments={segments} />
    </span>
  );
}
