"use client";

import { useState } from "react";
import { Flashcard } from "@/app/components/ui/Flashcard";
import { Button } from "@/app/components/ui/Button";

export type StudyModeQuestion = {
  id: string;
  question_text: string;
  answer_choices: string[];
  correct_answer: string;
  explanation: string;
  topic: string;
};

type StudyModeReviewProps = {
  deckTitle: string;
  questions: StudyModeQuestion[];
  onExit: () => void;
};

// Lower-stress companion to Battle Mode: no scoring, no streak, no timer --
// just flip-through flashcards for a first pass at the material before
// putting it under battle pressure. Deliberately a self-contained component
// (its own index state, no wiring into the battle page's score/streak/rival
// state machine) so it can't regress any of that logic.
export function StudyModeReview({ deckTitle, questions, onExit }: StudyModeReviewProps) {
  const [index, setIndex] = useState(0);
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());

  const question = questions[index];
  const isFlipped = flippedIds.has(question.id);

  const goTo = (nextIndex: number) => {
    setIndex(Math.max(0, Math.min(questions.length - 1, nextIndex)));
  };

  return (
    <div className="w-full max-w-lg">
      {/* Header row: exit control lives here, away from the card and the
          prev/next row below, so a mis-tap while flipping through cards
          can't accidentally back out of Study Mode. */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">Study Mode</span>
          <h1 className="mt-1 text-lg font-bold text-white sm:text-xl">{deckTitle}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Switch to Battle
        </Button>
      </div>

      <p className="mt-2 text-xs text-white/40">
        Card {index + 1} of {questions.length} · tap the card to flip it
      </p>

      <Flashcard
        className="mt-4"
        flipped={isFlipped}
        onFlip={(flipped) =>
          setFlippedIds((prev) => {
            const next = new Set(prev);
            if (flipped) next.add(question.id);
            else next.delete(question.id);
            return next;
          })
        }
        front={
          <div className="flex min-h-40 flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
              {question.topic}
            </span>
            <p className="mt-3 text-base font-bold leading-snug text-white sm:text-lg">
              {question.question_text}
            </p>
            <p className="mt-auto pt-4 text-xs text-white/35">Tap to reveal the answer</p>
          </div>
        }
        back={
          <div className="flex min-h-40 flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Answer</span>
            <p className="mt-2 text-base font-bold text-white">{question.correct_answer}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">{question.explanation}</p>
          </div>
        }
      />

      {/* Movement controls in their own row, visually separated from the
          card above -- flipping (a click anywhere on the card) and moving
          to the next card are different actions and shouldn't compete for
          the same tap target. */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
          Back
        </Button>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 transition-[width] duration-300"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => goTo(index + 1)}
          disabled={index === questions.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
