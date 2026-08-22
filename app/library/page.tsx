"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Composer } from "@/app/components/app/Composer";
import { PlusIcon, SearchIcon } from "@/app/components/app/Icons";
import type { DeckSummary } from "@/lib/studySnapshot";

// Library replaces every place material used to live: /decks, /curriculum,
// uploaded documents, saved study sets. One list, one hierarchy.
//
// Courses only appear as a grouping when the student actually has more than
// one. Wrapping a single course around a single list is a level of hierarchy
// that costs a click and explains nothing.

function MaterialRow({ deck }: { deck: DeckSummary }) {
  const status =
    deck.mastery === null
      ? "Not studied yet"
      : deck.dueTopics.length > 0
        ? `${deck.mastery}% mastered · ${deck.dueTopics.length} to review`
        : `${deck.mastery}% mastered`;

  return (
    <li>
      <Link
        href={`/library/${deck.id}`}
        className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-[var(--panel-raised)]"
      >
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[15px] font-medium"
            style={{ color: "var(--text-1)" }}
          >
            {deck.title}
          </p>
          <p className="t-meta mt-0.5 truncate">{status}</p>
        </div>

        {deck.mastery !== null && (
          <div className="hidden w-24 sm:block">
            <div className="meter">
              <span style={{ width: `${Math.min(100, Math.max(2, deck.mastery))}%` }} />
            </div>
          </div>
        )}

        {deck.dueTopics.length > 0 && <span className="chip chip-warn shrink-0">Due</span>}
      </Link>
    </li>
  );
}

function List({ decks }: { decks: DeckSummary[] }) {
  return (
    <ul className="card divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>
      {decks.map((deck) => (
        <MaterialRow key={deck.id} deck={deck} />
      ))}
    </ul>
  );
}

export default function LibraryPage() {
  const { isReady } = useRequireAuth();
  const { snapshot, isLoading } = useStudy();
  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return snapshot.decks.filter(
      (deck) =>
        deck.title.toLowerCase().includes(q) || deck.course.toLowerCase().includes(q)
    );
  }, [query, snapshot.decks]);

  const showCourses = snapshot.courses.length > 1;

  if (isLoading || !isReady) {
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-40" />
        <div className="skeleton mt-8 h-[220px] w-full" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="t-page">Library</h1>
        <button
          type="button"
          onClick={() => setIsAdding((open) => !open)}
          className="btn btn-primary btn-sm ml-auto"
          aria-expanded={isAdding}
        >
          <PlusIcon className="h-4 w-4" />
          Add material
        </button>
      </div>

      {isAdding && (
        <div className="mt-5 rise">
          <Composer autoFocus placeholder="What are you adding? A topic, your notes, or a file." />
          <p className="t-meta mt-3">
            Already have it somewhere else?{" "}
            <Link
              href="/library/import"
              className="underline underline-offset-2"
              style={{ color: "var(--brand-text)" }}
            >
              Import from Quizlet, Anki, or Google Docs
            </Link>
            .
          </p>
        </div>
      )}

      {snapshot.isEmpty ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Nothing here yet
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Everything you study lives here. Add your first thing and AcedIQ
            will build the notes, questions, and flashcards for you.
          </p>
          {!isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="btn btn-primary mt-6"
            >
              <PlusIcon className="h-4 w-4" />
              Add material
            </button>
          )}
        </div>
      ) : (
        <>
          {snapshot.decks.length > 6 && (
            <div className="relative mt-6">
              <SearchIcon
                className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2"
                // Decorative; the input below carries the label.
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your library"
                aria-label="Search your library"
                className="field pl-10"
              />
            </div>
          )}

          {filtered ? (
            <section className="mt-6">
              {filtered.length === 0 ? (
                <p className="t-body">
                  Nothing matches “{query.trim()}”.
                </p>
              ) : (
                <List decks={filtered} />
              )}
            </section>
          ) : showCourses ? (
            snapshot.courses.map((course) => (
              <section key={course.name} className="mt-8">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="t-section">{course.name}</h2>
                  {course.mastery !== null && (
                    <span className="t-meta">{course.mastery}% mastered</span>
                  )}
                </div>
                <div className="mt-3">
                  <List decks={course.decks} />
                </div>
              </section>
            ))
          ) : (
            <section className="mt-6">
              <List decks={snapshot.decks} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
