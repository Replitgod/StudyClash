"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { useStudy } from "@/lib/useStudy";
import { sessionHref } from "@/lib/nextAction";
import { MathText } from "@/app/components/ui/MathText";
import { FlashcardDeck, type Card } from "@/app/components/app/FlashcardDeck";
import {
  ArrowRightIcon,
  BackIcon,
  CheckIcon,
  SparkIcon,
  TrashIcon,
} from "@/app/components/app/Icons";

// The Material Workspace: one screen for one piece of material.
//
// This replaces the old /decks/[deckId] detail page plus the separate
// flashcard, notes and test surfaces it linked out to. Four tabs, one
// primary action, and Vyra one click away. There is nothing else.

type TabId = "study" | "cards" | "notes" | "test";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "study", label: "Study" },
  { id: "cards", label: "Flashcards" },
  { id: "notes", label: "Notes" },
  { id: "test", label: "Test" },
];

type DeckRecord = {
  id: string;
  title: string;
  course_name: string;
  raw_notes: string | null;
};

type QuestionRecord = {
  id: string;
  question_text: string;
  correct_answer: string;
  explanation: string | null;
  topic: string | null;
};

// Test presets. The default is chosen for the student; "Customize" only
// exists so the rare student who wants a longer test is not blocked.
const TEST_SIZES = [5, 10, 20];
const DEFAULT_TEST_SIZE = 10;

export default function MaterialWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deckId = String(params?.deckId || "");
  const { user, isLoading: isAuthLoading, isLoggedIn } = useAuth();
  const { snapshot, refresh } = useStudy();
  const userId = user?.id;

  const [tab, setTab] = useState<TabId>("study");
  const [deck, setDeck] = useState<DeckRecord | null>(null);
  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [testSize, setTestSize] = useState(DEFAULT_TEST_SIZE);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Arriving straight from the composer: say what was just built before
  // asking the student to do anything.
  const isNew = searchParams.get("new") === "1";

  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      router.replace(`/login?redirect=/library/${deckId}`);
    }
  }, [isAuthLoading, isLoggedIn, router, deckId]);

  useEffect(() => {
    if (!deckId || !userId) return;

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      supabase
        .from("decks")
        .select("id, title, course_name, raw_notes")
        .eq("id", deckId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("questions")
        .select("id, question_text, correct_answer, explanation, topic")
        .eq("deck_id", deckId),
    ])
      .then(([deckResult, questionResult]) => {
        if (cancelled) return;

        if (deckResult.error || !deckResult.data) {
          setLoadError(
            "We could not find this material. It may have been deleted."
          );
          setIsLoading(false);
          return;
        }

        setDeck(deckResult.data as DeckRecord);
        setQuestions((questionResult.data || []) as QuestionRecord[]);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("We could not load this material. Please try again.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deckId, userId]);

  const summary = useMemo(
    () => snapshot.decks.find((d) => d.id === deckId) || null,
    [snapshot.decks, deckId]
  );

  const cards: Card[] = useMemo(
    () =>
      questions.map((q) => ({
        id: q.id,
        front: q.question_text,
        back: q.correct_answer,
        note: q.explanation,
      })),
    [questions]
  );

  const topics = useMemo(() => {
    const seen = new Set<string>();
    for (const q of questions) {
      const topic = (q.topic || "").trim();
      if (topic) seen.add(topic);
    }
    return Array.from(seen);
  }, [questions]);

  const handleDelete = useCallback(async () => {
    if (!deck) return;
    setIsDeleting(true);

    try {
      // Deleting has to go through the API: `decks` is select-only for the
      // browser client, so a direct delete silently matches nothing and
      // reports success.
      const response = await authFetch(
        `/api/library/material?id=${encodeURIComponent(deck.id)}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("delete failed");
    } catch {
      setIsDeleting(false);
      setLoadError("We could not delete this. Please try again.");
      return;
    }

    refresh();
    router.push("/library");
  }, [deck, refresh, router]);

  /* ------------------------------------------------------------- loading */

  if (isLoading || isAuthLoading) {
    return (
      <div className="app-page">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton mt-4 h-9 w-72" />
        <div className="skeleton mt-8 h-11 w-full max-w-md" />
        <div className="skeleton mt-6 h-[220px] w-full" />
      </div>
    );
  }

  if (loadError || !deck) {
    return (
      <div className="app-page">
        <Link href="/library" className="btn btn-quiet btn-sm -ml-3">
          <BackIcon className="h-4 w-4" />
          Library
        </Link>
        <div className="card mt-6 px-6 py-12 text-center">
          <p className="t-body">{loadError || "Material not found."}</p>
          <Link href="/library" className="btn btn-secondary mt-6">
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  const mastery = summary?.mastery ?? null;
  const dueTopics = summary?.dueTopics ?? [];

  return (
    <div className="app-page">
      <Link href="/library" className="btn btn-quiet btn-sm -ml-3">
        <BackIcon className="h-4 w-4" />
        Library
      </Link>

      <header className="mt-3">
        <h1 className="t-page">{deck.title}</h1>
        <p className="t-meta mt-1.5">
          {questions.length} questions
          {mastery !== null ? ` · ${mastery}% mastered` : " · not studied yet"}
        </p>
      </header>

      {isNew && (
        <div
          className="card rise mt-5 flex items-center gap-3 px-4 py-3"
          style={{ borderColor: "rgb(52 211 153 / 0.3)", background: "var(--ok-soft)" }}
        >
          <CheckIcon className="h-[18px] w-[18px] shrink-0" />
          <p className="text-[14px]" style={{ color: "var(--text-1)" }}>
            Ready. AceDecks wrote your notes, {questions.length} questions, and{" "}
            {cards.length} flashcards.
          </p>
        </div>
      )}

      {/* ---- Tabs ---- */}
      <div
        className="mt-6 flex gap-1 overflow-x-auto border-b"
        style={{ borderColor: "var(--line)" }}
        role="tablist"
        aria-label="Material"
      >
        {TABS.map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(item.id)}
              className="relative shrink-0 px-3.5 py-2.5 text-[14px] font-medium transition-colors"
              style={{ color: isActive ? "var(--text-1)" : "var(--text-3)" }}
            >
              {item.label}
              {isActive && (
                <span
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                  style={{ background: "var(--brand)" }}
                />
              )}
            </button>
          );
        })}

        <Link
          href={`/vyra?about=${encodeURIComponent(deck.title)}`}
          className="ml-auto shrink-0 self-center px-3 py-2 text-[14px] font-medium"
          style={{ color: "var(--brand-text)" }}
        >
          Ask Vyra
        </Link>
      </div>

      {/* ---- Study ---- */}
      {tab === "study" && (
        <section className="mt-6 rise">
          <div className="card p-5 sm:p-6">
            <p className="t-section">Mastery</p>
            <p
              className="mt-1 text-[34px] font-semibold leading-none tracking-tight"
              style={{ color: "var(--text-1)" }}
            >
              {mastery === null ? "—" : `${mastery}%`}
            </p>
            <div className="meter mt-4">
              <span style={{ width: `${Math.min(100, Math.max(2, mastery ?? 0))}%` }} />
            </div>

            <p className="t-body mt-4">
              {mastery === null
                ? "You have not studied this yet. AceDecks will pick what to ask you first."
                : dueTopics.length > 0
                  ? `${dueTopics.length} ${dueTopics.length === 1 ? "topic is" : "topics are"} ready for review. AceDecks will start there.`
                  : "AceDecks will pick what you need next."}
            </p>

            <Link
              href={sessionHref({
                deckId: deck.id,
                topics: dueTopics,
                mode: dueTopics.length ? "weak_topic" : "battle",
              })}
              className="btn btn-primary btn-lg mt-5 w-full sm:w-auto"
            >
              {mastery === null ? "Start studying" : "Continue study session"}
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
          </div>

          {topics.length > 0 && (
            <div className="mt-6">
              <h2 className="t-section">What is in here</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {topics.map((topic) => (
                  <span key={topic} className="chip">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-10">
            {confirmDelete ? (
              <div className="card flex flex-wrap items-center gap-3 p-4">
                <p className="t-body flex-1">Delete “{deck.title}” for good?</p>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  className="btn btn-sm"
                  style={{ background: "var(--bad-soft)", color: "var(--bad)" }}
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="btn btn-quiet btn-sm -ml-3"
                style={{ color: "var(--text-3)" }}
              >
                <TrashIcon className="h-4 w-4" />
                Delete this material
              </button>
            )}
          </div>
        </section>
      )}

      {/* ---- Flashcards ---- */}
      {tab === "cards" && (
        <section className="mt-6 rise">
          <FlashcardDeck deckId={deck.id} cards={cards} />
        </section>
      )}

      {/* ---- Notes ---- */}
      {tab === "notes" && (
        <section className="mt-6 rise">
          {deck.raw_notes?.trim() ? (
            <article className="card px-5 py-6 sm:px-8 sm:py-8">
              {deck.raw_notes
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p
                    key={index}
                    className="mb-4 text-[16px] leading-[1.75] last:mb-0"
                    style={{ color: "var(--text-2)" }}
                  >
                    <MathText text={paragraph} />
                  </p>
                ))}
            </article>
          ) : (
            <div className="card px-6 py-12 text-center">
              <p className="t-body">There are no notes saved for this material.</p>
            </div>
          )}

          <Link
            href={`/vyra?about=${encodeURIComponent(deck.title)}`}
            className="btn btn-secondary mt-4"
          >
            <SparkIcon className="h-[17px] w-[17px]" />
            Ask Vyra about this
          </Link>
        </section>
      )}

      {/* ---- Test ---- */}
      {tab === "test" && (
        <section className="mt-6 rise">
          <div className="card p-5 sm:p-6">
            <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
              Practice test
            </p>
            <p className="t-meta mt-1">
              {Math.min(testSize, questions.length || testSize)} questions · about{" "}
              {Math.max(4, Math.round((testSize * 45) / 60))} minutes
            </p>

            <Link
              href={sessionHref({ deckId: deck.id, mode: "practice", limit: testSize })}
              className="btn btn-primary btn-lg mt-5 w-full sm:w-auto"
            >
              Start test
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowCustomize((open) => !open)}
                aria-expanded={showCustomize}
                className="btn btn-quiet btn-sm -ml-3"
                style={{ color: "var(--text-3)" }}
              >
                {showCustomize ? "Hide options" : "Customize"}
              </button>

              {showCustomize && (
                <fieldset className="mt-3 rise">
                  <legend className="t-section mb-2">How many questions</legend>
                  <div className="flex gap-2">
                    {TEST_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setTestSize(size)}
                        aria-pressed={testSize === size}
                        className="btn btn-sm"
                        style={
                          testSize === size
                            ? { background: "var(--brand-soft)", color: "var(--brand-text)", borderColor: "var(--brand-line)" }
                            : { background: "var(--panel-raised)", color: "var(--text-2)", borderColor: "var(--line-strong)" }
                        }
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
