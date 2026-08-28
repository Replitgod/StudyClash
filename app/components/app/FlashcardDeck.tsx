"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MathText } from "@/app/components/ui/MathText";
import { CheckIcon } from "./Icons";

// The flashcard player.
//
// One card, centred, big. Space or click reveals. Four ratings, which is the
// vocabulary every student already knows from Anki. Ratings drive the order
// cards come back in -- "Again" returns within the same session, "Easy" is
// parked -- so the student never has to think about scheduling, and the app
// never shows them an interval or a due date.
//
// Ratings persist per deck in localStorage. That is deliberate: it needs no
// migration, no request, and no network round trip between cards, and this
// is a personal study aid rather than shared state. If storage is
// unavailable the deck still works perfectly, it just starts fresh.

export type Card = {
  id: string;
  front: string;
  back: string;
  note?: string | null;
};

type Rating = "again" | "hard" | "good" | "easy";

// How many cards must pass before a card comes back around. "Again" is
// almost immediate; "Easy" is effectively the end of the session.
const GAP: Record<Rating, number> = { again: 2, hard: 5, good: 12, easy: 999 };

const RATINGS: Array<{ id: Rating; label: string; key: string }> = [
  { id: "again", label: "Again", key: "1" },
  { id: "hard", label: "Hard", key: "2" },
  { id: "good", label: "Good", key: "3" },
  { id: "easy", label: "Easy", key: "4" },
];

function storageKey(deckId: string) {
  return `acedecks_cards_${deckId}`;
}

function loadRatings(deckId: string): Record<string, Rating> {
  try {
    const raw = window.localStorage.getItem(storageKey(deckId));
    return raw ? (JSON.parse(raw) as Record<string, Rating>) : {};
  } catch {
    return {};
  }
}

function saveRatings(deckId: string, ratings: Record<string, Rating>) {
  try {
    window.localStorage.setItem(storageKey(deckId), JSON.stringify(ratings));
  } catch {
    // Private browsing, storage disabled, quota: none of these should stop
    // the student studying.
  }
}

export function FlashcardDeck({ deckId, cards }: { deckId: string; cards: Card[] }) {
  // Cards the student still owes this session, in order.
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [isRestored, setIsRestored] = useState(false);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const liveRegionRef = useRef<HTMLParagraphElement>(null);

  // Start with the cards the student was weakest on, so a short session
  // spends its time where it helps.
  useEffect(() => {
    const saved = loadRatings(deckId);
    const weight: Record<Rating, number> = { again: 0, hard: 1, good: 2, easy: 3 };
    const ordered = cards
      .slice()
      .sort((a, b) => {
        const aWeight = saved[a.id] ? weight[saved[a.id]] : 1.5;
        const bWeight = saved[b.id] ? weight[saved[b.id]] : 1.5;
        return aWeight - bWeight;
      })
      .map((c) => c.id);

    setRatings(saved);
    setQueue(ordered);
    setDoneCount(0);
    setRevealed(false);
    setIsRestored(true);
  }, [deckId, cards]);

  const currentId = queue[0];
  const current = currentId ? cardById.get(currentId) : undefined;
  const total = cards.length;

  const rate = useCallback(
    (rating: Rating) => {
      if (!currentId) return;

      const nextRatings = { ...ratings, [currentId]: rating };
      setRatings(nextRatings);
      saveRatings(deckId, nextRatings);

      setQueue((prev) => {
        const [head, ...rest] = prev;
        if (head === undefined) return prev;
        // "Easy" (or a gap past the end of the queue) retires the card for
        // this session; anything else slots it back in further down.
        const gap = GAP[rating];
        if (gap >= rest.length) return rest;
        return [...rest.slice(0, gap), head, ...rest.slice(gap)];
      });

      setDoneCount((n) => n + 1);
      setRevealed(false);
    },
    [currentId, ratings, deckId]
  );

  const restart = useCallback(() => {
    setQueue(cards.map((c) => c.id));
    setDoneCount(0);
    setRevealed(false);
  }, [cards]);

  // Keyboard: space/enter reveals, 1-4 rate. Ignored while the student is
  // typing somewhere else on the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!current) return;

      if (!revealed && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        setRevealed(true);
        return;
      }

      if (revealed) {
        const match = RATINGS.find((r) => r.key === event.key);
        if (match) {
          event.preventDefault();
          rate(match.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, revealed, rate]);

  if (!isRestored) {
    return <div className="skeleton h-[320px] w-full" />;
  }

  if (total === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="t-body">This material has no cards yet.</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="card px-6 py-14 text-center">
        <span
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
        >
          <CheckIcon className="h-6 w-6" />
        </span>
        <p className="text-[18px] font-medium" style={{ color: "var(--text-1)" }}>
          All {total} cards done
        </p>
        <p className="t-body mt-1">Nice work. Come back tomorrow and they will stick.</p>
        <button type="button" onClick={restart} className="btn btn-secondary mt-6">
          Go again
        </button>
      </div>
    );
  }

  const progress = Math.round((doneCount / Math.max(total, 1)) * 100);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="meter flex-1">
          <span style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <span className="t-meta shrink-0 tabular-nums">
          {queue.length} left
        </span>
      </div>

      <button
        type="button"
        onClick={() => (revealed ? undefined : setRevealed(true))}
        aria-live="polite"
        className="card flex w-full min-h-[280px] cursor-pointer flex-col items-center justify-center gap-5 px-6 py-10 text-center sm:min-h-[320px] sm:px-10"
        style={{ cursor: revealed ? "default" : "pointer" }}
      >
        <p
          className="max-w-2xl text-[19px] leading-relaxed sm:text-[21px]"
          style={{ color: "var(--text-1)" }}
        >
          <MathText text={current.front} />
        </p>

        {revealed ? (
          <>
            <hr className="rule max-w-xs" />
            <p
              className="max-w-2xl text-[18px] font-medium leading-relaxed"
              style={{ color: "var(--brand-text)" }}
            >
              <MathText text={current.back} />
            </p>
            {current.note && (
              <p className="t-body max-w-xl text-[14px]">
                <MathText text={current.note} />
              </p>
            )}
          </>
        ) : (
          <span className="t-meta">Click or press space to see the answer</span>
        )}
      </button>

      <p ref={liveRegionRef} className="visually-hidden" aria-live="polite">
        {revealed ? `Answer: ${current.back}` : ""}
      </p>

      {revealed && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((rating) => (
            <button
              key={rating.id}
              type="button"
              onClick={() => rate(rating.id)}
              className="btn btn-secondary"
            >
              {rating.label}
              <span className="t-meta hidden sm:inline">{rating.key}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
