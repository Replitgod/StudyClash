"use client";

import { useEffect, useRef, useState } from "react";

// Scroll reveal, built on IntersectionObserver rather than a scroll handler
// so it costs nothing on the main thread while scrolling.
//
// Two deliberate behaviours:
//
//   It only fires once. Content that re-animates every time it scrolls back
//   into view is distracting on a second read and makes a long page feel
//   twitchy.
//
//   If the observer is unavailable, or the element is already on screen at
//   mount, it shows immediately. A reveal that can fail closed would leave
//   a blank marketing page, which is far worse than no animation.

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** ms. Used to stagger siblings. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span" | "header" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    // Anything already at or above the fold on mount is shown immediately,
    // without waiting for an intersection callback. Deep-linking to an
    // anchor, restoring a scroll position, or simply loading a short page
    // can all put an element on screen before the observer ever samples it.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // threshold 0: fire the moment any pixel crosses in. A
          // percentage threshold can be skipped entirely by a fast
          // flick-scroll -- the element is sampled below the fold, then
          // above it, never at 12% visible -- which strands the content
          // invisible with no way to recover.
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // Fires slightly before the element reaches the fold, so it has
      // settled by the time it is properly in view rather than animating
      // under the reader's eye.
      { threshold: 0, rootMargin: "0px 0px -60px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`reveal ${className || ""}`}
      data-shown={shown ? "true" : "false"}
      style={{ ["--reveal-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * Splits a line into words and reveals them in sequence.
 *
 * Per-word rather than per-character: character stagger on a headline this
 * size reads as a novelty typing effect, and it breaks text selection and
 * screen-reader flow into individual letters. The whole string stays in one
 * accessible label; only the visual spans are split.
 */
export function RevealWords({
  text,
  className,
  delay = 0,
  step = 55,
}: {
  text: string;
  className?: string;
  delay?: number;
  step?: number;
}) {
  const words = text.split(" ");

  return (
    <span className={className}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className="inline-block overflow-hidden align-bottom"
          >
            <span
              className="inline-block"
              style={{
                animation: `word-rise 0.85s var(--ease-premium-out) both`,
                animationDelay: `${delay + index * step}ms`,
              }}
            >
              {word}
              {index < words.length - 1 ? " " : ""}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
