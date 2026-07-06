"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Deck = {
  id: string;
  student_name: string;
  course_name: string;
  title: string;
  created_at: string;
};

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDecks() {
      setIsLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("decks")
        .select("id, student_name, course_name, title, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setLoadError(error.message);
        setIsLoading(false);
        return;
      }

      setDecks(data || []);
      setIsLoading(false);
    }

    loadDecks();
  }, []);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>

      {/* Grid texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
        {/* Badge */}
        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          ALL DECKS
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Battle Decks
          </span>
        </h1>
        <p className="mt-3 max-w-md text-center text-sm text-white/50 sm:text-base">
          Pick a deck below and jump into a battle.
        </p>

        {/* Create new deck button */}
        <Link
          href="/login?redirect=/create"
          className="group relative mt-6 inline-flex w-full max-w-xs items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:mt-8 sm:w-auto sm:hover:scale-105"
        >
          <span className="relative z-10">+ Create New Deck</span>
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
        </Link>

        {/* Loading state */}
        {isLoading && (
          <div className="mt-14 flex flex-col items-center sm:mt-16">
            <svg
              className="h-10 w-10 animate-spin text-fuchsia-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <p className="mt-4 text-sm text-white/50">Loading decks...</p>
          </div>
        )}

        {/* Error state */}
        {!isLoading && loadError && (
          <div className="mt-8 w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-center sm:mt-10 sm:p-6">
            <h2 className="text-lg font-bold text-red-300">
              Couldn&apos;t load decks
            </h2>
            <p className="mt-2 text-sm text-red-200/80">{loadError}</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !loadError && decks.length === 0 && (
          <div className="mt-14 flex flex-col items-center px-4 text-center sm:mt-16">
            <p className="text-white/50">No decks yet.</p>
            <p className="mt-1 text-sm text-white/30">
              Create your first battle deck to get started.
            </p>
          </div>
        )}

        {/* Deck grid */}
        {!isLoading && !loadError && decks.length > 0 && (
          <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-colors duration-200 hover:border-fuchsia-400/30 hover:bg-white/[0.06] sm:p-6"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                    {deck.course_name}
                  </span>
                  <h3 className="mt-2 break-words text-lg font-bold leading-snug text-white">
                    {deck.title}
                  </h3>

                  <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
                    <svg
                      className="h-4 w-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                    <span className="truncate">{deck.student_name}</span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 text-xs text-white/30">
                    <svg
                      className="h-4 w-4 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                      />
                    </svg>
                    {formatDate(deck.created_at)}
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2.5">
                  <Link
                    href={`/battle/${deck.id}`}
                    className="group/btn relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.5)] transition-transform duration-200 active:scale-95 sm:py-3 sm:hover:scale-[1.02]"
                  >
                    <span className="relative z-10">Play Battle</span>
                    <svg
                      className="relative z-10 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover/btn:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover/btn:translate-x-full" />
                  </Link>

                  <Link
                    href={`/decks/${deck.id}`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-bold text-white/90 backdrop-blur-sm transition-colors duration-150 hover:border-cyan-400/40 hover:bg-white/10 sm:py-3"
                  >
                    View Deck
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}