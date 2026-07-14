"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { springSmooth } from "@/lib/motion";

export type FlashcardProps = {
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
  /** Controlled flip state. Omit to let the card manage its own click-to-flip state. */
  flipped?: boolean;
  onFlip?: (flipped: boolean) => void;
};

// Both faces are mounted at all times and rotated in true 3D space (not
// crossfaded), each with backface-visibility hidden -- so whichever face is
// rotated away from the viewer is actually invisible mid-flip rather than
// showing through as text/backgrounds overlap at the 90-degree midpoint.
export function Flashcard({ front, back, className, flipped, onFlip }: FlashcardProps) {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = flipped ?? internalFlipped;

  const toggleFlip = () => {
    const next = !isFlipped;
    if (onFlip) onFlip(next);
    if (flipped === undefined) setInternalFlipped(next);
  };

  return (
    <div className={className} style={{ perspective: 1200 }}>
      <motion.div
        role="button"
        tabIndex={0}
        aria-pressed={isFlipped}
        onClick={toggleFlip}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleFlip();
          }
        }}
        className="relative w-full cursor-pointer"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={springSmooth}
      >
        {/* Front sits in normal flow -- its rendered height becomes the
            card's height, so the back (absolutely positioned) always
            matches it without the caller having to hardcode a height. */}
        <div
          className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6"
          style={{ backfaceVisibility: "hidden" }}
        >
          {front}
        </div>
        <div
          className="absolute inset-0 h-full w-full rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.06] p-5 backdrop-blur-sm sm:p-6"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
}
