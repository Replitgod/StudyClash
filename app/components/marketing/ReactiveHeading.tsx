"use client";

import { useEffect, useRef } from "react";
import { subscribeMotion } from "@/lib/motionEngine";

// A heading that reacts to how fast the page is moving.
//
// Scroll velocity drives the variable font's width axis and weight: the
// type compresses and thickens as you accelerate, and relaxes back when you
// settle. Pointer velocity adds a smaller nudge, so the headline is subtly
// alive even without scrolling.
//
// This is written to a CSS variable on one element per frame. It never
// touches React state -- a heading re-rendering sixty times a second would
// cost far more than the effect is worth, and would re-render every sibling
// with it.
//
// The range is deliberately narrow. Type that visibly deforms is a novelty;
// type that firms up slightly under speed reads as responsive material,
// which is the actual goal.

export function ReactiveHeading({
  children,
  className,
  as: Tag = "h2",
  /** Width axis at rest, and how far it compresses at full speed. */
  restWidth = 100,
  compression = 16,
  id,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "div";
  restWidth?: number;
  compression?: number;
  id?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let current = restWidth;
    let currentWeight = 800;

    return subscribeMotion((m) => {
      const energy = Math.min(1, m.scrollVelocity * 0.85 + m.pointerVelocity * 0.3);

      const targetWidth = restWidth - energy * compression;
      const targetWeight = 800 - energy * 130;

      // Eased toward the target rather than snapped: the motion engine is
      // already smoothed, but a second pass here is what stops the axis
      // from visibly stepping on a cheap display.
      current += (targetWidth - current) * 0.14;
      currentWeight += (targetWeight - currentWeight) * 0.14;

      node.style.setProperty("--wdth", current.toFixed(1));
      node.style.fontWeight = String(Math.round(currentWeight));
    });
  }, [restWidth, compression]);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      id={id}
      className={`brutal ${className || ""}`}
      style={{ ["--wdth" as string]: restWidth, ...style }}
    >
      {children}
    </Tag>
  );
}
