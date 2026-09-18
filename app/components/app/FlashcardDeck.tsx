"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { MathText } from "@/app/components/ui/MathText";
import { CheckIcon } from "./Icons";
import {
  describeDueIn,
  isCardDue,
  orderForReview,
  type CardState,
  type Rating,
} from "@/lib/flashcards";

// The flashcard player.
//
// One card at a time. The student is asked to come up with the answer --
// out loud, in their head, or typed into the optional box -- before the card
// turns over, because recall is what makes a card worth doing; recognising
// an answer you have just been shown is not.
//
// The schedule is the server's (lib/flashcards.ts, stored per student):
// cards that are due come first, then new ones. A card rated Again comes
// back a few cards later in the same sitting and again in ten minutes; Easy
// may not come back for weeks. Every rating also counts toward the topic's
// mastery, so a flashcard session moves the same numbers a question session
// does.

type Card = {
  id: string;
  front: string;
  back: string;
  note: string | null;
  topic: string;
  kind: string;
  position: number;
  state: CardState | null;
};

const RATINGS: Array<{ id: Rating; label: string; key: string; hint: string }> = [
  { id: "again", label: "Again", key: "1", hint: "I didn't know it" },
  { id: "hard", label: "Hard", key: "2", hint: "Got it, barely" },
  { id: "good", label: "Good", key: "3", hint: "Got it" },
  { id: "easy", label: "Easy", key: "4", hint: "Instantly" },
];

/** How many new cards one sitting introduces. More than this and nothing sticks. */
const NEW_PER_SESSION = 20;
/** Cards before a failed card returns in the same sitting. */
const RELEARN_GAP = 3;

type LoadState =
  | { status: "loading"; writing: boolean }
  | { status: "error"; message: string }
  | { status: "ready" };

export function FlashcardDeck({
  deckId,
  onReviewed,
}: {
  deckId: string;
  /** Called after the sitting ends, so progress elsewhere can refresh. */
  onReviewed?: () => void;
}) {
  const [load, setLoad] = useState<LoadState>({ status: "loading", writing: false });
  const [cards, setCards] = useState<Card[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [againCount, setAgainCount] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  // "Now", captured when the cards load and at each rating, for the
  // when-is-it-due line. Read from state rather than the clock during render.
  const [nowMark, setNowMark] = useState(0);
  const shownAtRef = useRef(0);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const buildQueue = useCallback((list: Card[], includeAll: boolean) => {
    const now = Date.now();
    const ordered = orderForReview(list, now);
    const due = ordered.filter((c) => c.state && isCardDue(c.state, now));
    const fresh = ordered.filter((c) => !c.state).slice(0, NEW_PER_SESSION);
    const base = includeAll ? list.map((c) => c.id) : [...due, ...fresh].map((c) => c.id);
    return base;
  }, []);

  const loadCards = useCallback(async () => {
    setLoad({ status: "loading", writing: false });
    // Writing cards for an older set takes a few seconds; say so rather than
    // spinning silently.
    const slowTimer = window.setTimeout(() => setLoad({ status: "loading", writing: true }), 1200);
    try {
      const response = await authFetch(`/api/flashcards?deckId=${encodeURIComponent(deckId)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "We couldn't load your flashcards.");
      }
      const list = (Array.isArray(data?.cards) ? data.cards : []) as Card[];
      setCards(list);
      setQueue(buildQueue(list, false));
      setReviewedIds(new Set());
      setAgainCount(0);
      setRevealed(false);
      setTyped("");
      setSessionStarted(false);
      setLoad({ status: "ready" });
      shownAtRef.current = Date.now();
      setNowMark(Date.now());
    } catch (err) {
      setLoad({
        status: "error",
        message: err instanceof Error ? err.message : "We couldn't load your flashcards.",
      });
    } finally {
      window.clearTimeout(slowTimer);
    }
  }, [deckId, buildQueue]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const currentId = queue[0];
  const current = currentId ? cardById.get(currentId) : undefined;

  const saveRating = useCallback(
    async (cardId: string, rating: Rating) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await authFetch("/api/flashcards/review", {
            method: "POST",
            body: JSON.stringify({ cardId, rating }),
          });
          if (response.ok) {
            const data = await response.json().catch(() => null);
            if (data?.state) {
              setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, state: data.state } : c)));
            }
            return;
          }
        } catch {
          // Retried once below.
        }
      }
      setSaveFailed(true);
    },
    []
  );

  const rate = useCallback(
    (rating: Rating) => {
      if (!currentId || !revealed) return;
      setSessionStarted(true);
      void saveRating(currentId, rating);
      setReviewedIds((prev) => new Set(prev).add(currentId));
      if (rating === "again") setAgainCount((n) => n + 1);

      setQueue((prev) => {
        const [head, ...rest] = prev;
        if (head === undefined) return prev;
        // A failed card comes back a few cards later, after a real gap.
        if (rating === "again") {
          const at = Math.min(RELEARN_GAP, rest.length);
          return [...rest.slice(0, at), head, ...rest.slice(at)];
        }
        return rest;
      });
      setRevealed(false);
      setTyped("");
      shownAtRef.current = Date.now();
      setNowMark(Date.now());
    },
    [currentId, revealed, saveRating]
  );

  // Tell the rest of the app once the sitting is over.
  const finished = load.status === "ready" && sessionStarted && !current;
  useEffect(() => {
    if (finished) onReviewed?.();
  }, [finished, onReviewed]);

  // Space or Enter turns the card (when not typing); 1-4 rate it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || !current) return;
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

      if (!revealed) {
        if ((event.key === "Enter" && typing) || ((event.key === " " || event.key === "Enter") && !typing)) {
          if (!typing && target?.tagName === "BUTTON") return;
          event.preventDefault();
          // Leave the answer box so 1-4 rate the card straight away.
          if (typing) target?.blur();
          setRevealed(true);
        }
        return;
      }
      if (typing) return;
      const match = RATINGS.find((r) => r.key === event.key);
      if (match) {
        event.preventDefault();
        rate(match.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, revealed, rate]);

  /* ---------------------------------------------------------------- views */

  if (load.status === "loading") {
    return (
      <div className="card flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-10 text-center" aria-busy="true">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--brand)", borderRightColor: "var(--brand)" }}
          aria-hidden="true"
        />
        <p className="t-body" role="status">
          {load.writing ? "Writing flashcards for this set. This takes a few seconds, once." : "Loading your cards…"}
        </p>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="t-body">{load.message}</p>
        <button type="button" onClick={() => void loadCards()} className="btn btn-secondary mt-5">
          Try again
        </button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="t-body">
          There isn&rsquo;t enough in this set to make flashcards from. Add notes to it, or use the
          Study tab.
        </p>
      </div>
    );
  }

  if (!current) {
    const now = nowMark;
    const nextDue = cards
      .map((c) => c.state?.dueAt)
      .filter((d): d is string => Boolean(d) && Date.parse(d as string) > now)
      .sort()[0];
    const nothingDue = !sessionStarted;

    return (
      <div className="card px-6 py-12 text-center">
        <span
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
        >
          <CheckIcon className="h-6 w-6" />
        </span>
        <p className="text-[18px] font-medium" style={{ color: "var(--text-1)" }}>
          {nothingDue ? "Nothing due right now" : `Done: ${reviewedIds.size} card${reviewedIds.size === 1 ? "" : "s"}`}
        </p>
        <p className="t-body mx-auto mt-2 max-w-sm">
          {nothingDue
            ? nextDue
              ? `Your next cards are due ${describeDueIn(nextDue, now)}. Reviewing then is what makes them stick.`
              : "You're up to date on this set."
            : againCount > 0
              ? `${againCount} ${againCount === 1 ? "card needs" : "cards need"} another look. They'll come back soon, before the rest.`
              : "Everything you just did will come back right before you'd start to forget it."}
        </p>
        {saveFailed && (
          <p className="t-meta mt-3" role="alert" style={{ color: "var(--warn)" }}>
            Some ratings didn&rsquo;t save. Check your connection; the cards will still come back.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setQueue(buildQueue(cards, true));
            setSessionStarted(false);
            setReviewedIds(new Set());
            setAgainCount(0);
          }}
          className="btn btn-secondary mt-6"
        >
          Go through all {cards.length} anyway
        </button>
      </div>
    );
  }

  const done = reviewedIds.size;
  const remaining = queue.length;
  const progress = Math.round((done / Math.max(done + remaining, 1)) * 100);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div
          className="meter flex-1"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={done + remaining}
          aria-valuenow={done}
          aria-label="Cards reviewed"
        >
          <span style={{ width: `${Math.min(100, Math.max(2, progress))}%` }} />
        </div>
        <span className="t-meta shrink-0 tabular-nums">{remaining} left</span>
      </div>

      <div className="card flex min-h-[280px] flex-col items-center justify-center gap-5 px-6 py-10 text-center sm:min-h-[320px] sm:px-10">
        <p className="t-meta">{current.topic}</p>
        <p className="max-w-2xl text-[19px] leading-relaxed sm:text-[21px]" style={{ color: "var(--text-1)" }}>
          <MathText text={current.front} />
        </p>

        {revealed ? (
          <>
            <hr className="rule max-w-xs" />
            {typed.trim() && (
              <p className="t-meta max-w-xl">
                You wrote: <span style={{ color: "var(--text-2)" }}>{typed.trim()}</span>
              </p>
            )}
            <p className="max-w-2xl text-[18px] font-medium leading-relaxed" style={{ color: "var(--brand-text)" }} aria-live="polite">
              <MathText text={current.back} />
            </p>
            {current.note && (
              <p className="t-body max-w-xl text-[14px]">
                <MathText text={current.note} />
              </p>
            )}
          </>
        ) : (
          <div className="w-full max-w-md">
            <label htmlFor="flashcard-answer" className="t-meta block">
              Say the answer, or type it, before you turn the card.
            </label>
            <input
              id="flashcard-answer"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Your answer (optional)"
              autoComplete="off"
              className="field mt-2 text-center"
            />
            <button type="button" onClick={() => setRevealed(true)} className="btn btn-primary mt-3 w-full">
              Show answer
            </button>
          </div>
        )}
      </div>

      {revealed && (
        <div className="mt-4">
          <p className="t-meta mb-2 text-center">How well did you know it?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATINGS.map((rating) => (
              <button
                key={rating.id}
                type="button"
                onClick={() => rate(rating.id)}
                className="btn btn-secondary flex-col gap-0 py-2.5"
                aria-keyshortcuts={rating.key}
              >
                <span>{rating.label}</span>
                <span className="t-meta text-[12px]">{rating.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
