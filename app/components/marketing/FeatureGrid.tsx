"use client";

import { useCallback } from "react";
import {
  Brain,
  Compass,
  FileStack,
  MessageSquareText,
  RotateCcw,
  Target,
  type LucideIcon,
} from "lucide-react";

// "Everything you need to study."
//
// Six cards, each one an OUTCOME rather than a mechanism: what a student gets,
// not what the system is called. A card is an icon, a short title, and one
// sentence -- if a feature needs a paragraph here, the feature is not clear
// enough to sell in a grid.
//
// The hover shimmer is the same `.bento` treatment used everywhere else on the
// page: pointermove writes --mx/--my and the CSS radial gradient reads them,
// which keeps it entirely off React's render path.

type Feature = {
  title: string;
  body: string;
  Icon: LucideIcon;
};

const FEATURES: Feature[] = [
  {
    title: "Notes become a study guide",
    body: "Drop a PDF, a photo of the page, or just type the topic. You get a guide worth reading back.",
    Icon: FileStack,
  },
  {
    title: "Cards that come back",
    body: "Miss one and it returns tomorrow. Prove you know it and it waits a month.",
    Icon: RotateCcw,
  },
  {
    title: "Practice that adapts",
    body: "Questions get harder as you improve, and stay on the topics you keep dropping.",
    Icon: Target,
  },
  {
    title: "Every mistake explained",
    body: "Never just “wrong”. The exact thing you mixed up, and how to catch it next time.",
    Icon: Brain,
  },
  {
    title: "A tutor that read your notes",
    body: "Ask anything about your own material. It answers from the page, and tells you which one.",
    Icon: MessageSquareText,
  },
  {
    title: "One thing to do next",
    body: "Open it and the decision is already made. No plan to build, no mode to pick.",
    Icon: Compass,
  },
];

export function FeatureGrid() {
  const track = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((feature) => (
        <article key={feature.title} className="bento p-6" onPointerMove={track}>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
            style={{
              border: "1px solid var(--accent-line)",
              background: "var(--accent-soft)",
            }}
          >
            <feature.Icon
              className="h-4 w-4"
              style={{ color: "var(--accent-bright)" }}
            />
          </span>

          <h3
            className="mt-5 text-[17px] font-semibold tracking-[-0.02em]"
            style={{ color: "var(--text-1)" }}
          >
            {feature.title}
          </h3>

          <p
            className="mt-2 text-[14.5px] leading-relaxed"
            style={{ color: "var(--text-2)" }}
          >
            {feature.body}
          </p>
        </article>
      ))}
    </div>
  );
}
