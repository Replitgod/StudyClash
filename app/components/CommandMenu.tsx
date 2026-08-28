"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useStudy } from "@/lib/useStudy";
import { UI_Z_INDEX } from "@/lib/uiLayout";

// Ctrl/Cmd+K search.
//
// It searches what the student actually has -- their materials and their
// topics -- and falls back to the four destinations. It used to be a fixed
// list of nine hardcoded links, which meant the one thing a student would
// realistically search for (the name of the thing they are studying) was
// the one thing it could not find.

export const OPEN_COMMAND_MENU_EVENT = "acedecks:open-command-menu";

type Result = {
  id: string;
  label: string;
  hint: string;
  href: string;
  /** Grouping header in the list. */
  group: string;
};

const DESTINATIONS: Result[] = [
  { id: "go-home", label: "Home", hint: "What to study next", href: "/home", group: "Go to" },
  { id: "go-library", label: "Library", hint: "Everything you are studying", href: "/library", group: "Go to" },
  { id: "go-practice", label: "Practice", hint: "Train on your weak spots", href: "/practice", group: "Go to" },
  { id: "go-vyra", label: "Vyra", hint: "Ask the AI tutor", href: "/vyra", group: "Go to" },
  { id: "go-settings", label: "Settings", hint: "Your account", href: "/settings", group: "Go to" },
];

const MAX_PER_GROUP = 6;

export function CommandMenu() {
  const router = useRouter();
  const { snapshot } = useStudy();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => setIsMounted(true), []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();

    const materials: Result[] = snapshot.decks.map((deck) => ({
      id: `deck-${deck.id}`,
      label: deck.title,
      hint:
        deck.mastery === null ? "Not studied yet" : `${deck.mastery}% mastered`,
      href: `/library/${deck.id}`,
      group: "Your material",
    }));

    const topics: Result[] = snapshot.topics.map((topic) => ({
      id: `topic-${topic.deckId}-${topic.topic}`,
      label: topic.topic,
      hint: `in ${topic.deckTitle}`,
      href: `/library/${topic.deckId}`,
      group: "Topics",
    }));

    if (!q) {
      return [...materials.slice(0, MAX_PER_GROUP), ...DESTINATIONS];
    }

    const matches = (item: Result) =>
      `${item.label} ${item.hint}`.toLowerCase().includes(q);

    return [
      ...materials.filter(matches).slice(0, MAX_PER_GROUP),
      ...topics.filter(matches).slice(0, MAX_PER_GROUP),
      ...DESTINATIONS.filter(matches),
    ];
  }, [query, snapshot.decks, snapshot.topics]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    restoreFocusRef.current?.focus?.();
  }, []);

  const run = useCallback(
    (result: Result) => {
      close();
      router.push(result.href);
    },
    [close, router]
  );

  // Global Cmd/Ctrl+K, plus an app-wide open event so a search button
  // anywhere can summon it without lifting state.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => {
          if (!prev) restoreFocusRef.current = document.activeElement as HTMLElement;
          return !prev;
        });
      }
    };

    const onOpen = () => {
      restoreFocusRef.current = document.activeElement as HTMLElement;
      setOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      // Focus after the portal paints, or the caret lands nowhere.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  if (!isMounted || !open) return null;

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) run(result);
    }
  };

  let lastGroup = "";

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center px-4 pt-[12vh]"
      style={{ zIndex: UI_Z_INDEX.commandMenu, background: "rgb(0 0 0 / 0.55)" }}
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onListKeyDown}
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border"
        style={{
          borderColor: "var(--line-strong)",
          background: "var(--panel)",
          boxShadow: "var(--shadow-elevation-lg)",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your material…"
          aria-label="Search your material"
          className="w-full border-b bg-transparent px-4 py-3.5 text-[16px] outline-none"
          style={{ borderColor: "var(--line)", color: "var(--text-1)" }}
        />

        <ul className="max-h-[52vh] overflow-y-auto py-1.5" role="listbox">
          {results.length === 0 && (
            <li className="t-meta px-4 py-6 text-center">Nothing matches that.</li>
          )}

          {results.map((result, index) => {
            const showGroup = result.group !== lastGroup;
            lastGroup = result.group;
            const isActive = index === activeIndex;

            return (
              <li key={result.id}>
                {showGroup && (
                  <p className="t-section px-4 pb-1 pt-3 text-[11px]">{result.group}</p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => run(result)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  style={{ background: isActive ? "var(--panel-raised)" : "transparent" }}
                >
                  <span
                    className="min-w-0 flex-1 truncate text-[14px] font-medium"
                    style={{ color: "var(--text-1)" }}
                  >
                    {result.label}
                  </span>
                  <span className="t-meta shrink-0 truncate">{result.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}
