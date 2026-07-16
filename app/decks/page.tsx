"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useLoadingTimeout } from "@/lib/useLoadingTimeout";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Button } from "@/app/components/ui/Button";
import { HoverLiftArticle } from "@/app/components/ui/HoverLift";
import { Skeleton } from "@/app/components/ui/Skeleton";

type Deck = {
  id: string;
  student_name: string;
  course_name: string;
  title: string;
  created_at: string;
};

const DEMO_DECK = {
  title: "Algebra Skills Battle",
  course_name: "High School Algebra",
  student_name: "Demo Student",
};

// Unpaginated growth here means both an ever-larger Supabase query and an
// ever-larger unvirtualized DOM list -- most students have a handful of
// decks, but nothing capped this page for a student who has been generating
// decks all year. Fetching in pages of 30 keeps first paint fast regardless
// of how many decks someone has accumulated.
const DECKS_PAGE_SIZE = 30;

export default function DecksPage() {
  const { user, isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const authTimedOut = useLoadingTimeout(isAuthLoading);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreDecks, setHasMoreDecks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadMoreDecks() {
    if (!user?.id || isLoadingMore) return;

    setIsLoadingMore(true);

    const { data, error } = await supabase
      .from("decks")
      .select("id, student_name, course_name, title, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(decks.length, decks.length + DECKS_PAGE_SIZE - 1);

    if (error) {
      setLoadError(error.message);
      setIsLoadingMore(false);
      return;
    }

    const page = data || [];
    setDecks((prev) => [...prev, ...page]);
    setHasMoreDecks(page.length === DECKS_PAGE_SIZE);
    setIsLoadingMore(false);
  }

  useEffect(() => {
    async function loadDecks() {
      if (!user?.id) {
        void Promise.resolve().then(() => {
          setDecks([]);
          setIsLoading(false);
        });
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("decks")
        .select("id, student_name, course_name, title, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(0, DECKS_PAGE_SIZE - 1);

      if (error) {
        setLoadError(error.message);
        setIsLoading(false);
        return;
      }

      const page = data || [];
      setDecks(page);
      setHasMoreDecks(page.length === DECKS_PAGE_SIZE);
      setIsLoading(false);
    }

    if (isAuthLoading) {
      return;
    }

    if (!isLoggedIn || !user) {
      void Promise.resolve().then(() => {
        setDecks([]);
        setIsLoading(false);
      });
      return;
    }

    loadDecks();
  }, [isAuthLoading, isLoggedIn, user]);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isAuthLoading) {
    return (
      <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[130px]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative z-10 flex min-h-dvh items-center justify-center px-4">
          <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center backdrop-blur-sm">
            {authTimedOut ? (
              <>
                <p className="text-sm font-semibold text-white/80">This is taking longer than expected.</p>
                <div className="mt-4 flex items-center gap-2.5">
                  <button
                    onClick={() => window.location.reload()}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors duration-150 hover:bg-indigo-500"
                  >
                    Retry
                  </button>
                  <Link
                    href="/"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 transition-colors duration-150 hover:bg-white/10"
                  >
                    Return Home
                  </Link>
                </div>
              </>
            ) : (
              <>
                <svg className="h-10 w-10 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <p className="mt-4 text-sm text-white/50">Checking your account...</p>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[130px]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-12">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
              <svg className="h-6 w-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-white">Please sign in to view your decks</h1>
            <p className="mt-2 text-sm text-white/50">Your decks are private to your account, so you need to be signed in to see them.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
              <Button href="/demo/battle" variant="secondary">
                Try Demo Deck
              </Button>
              <Button href="/login?redirect=/decks" variant="primary">
                Log In
              </Button>
              <Button href="/signup?redirect=/decks" variant="ghost">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[130px]" />
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

      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center px-4 pt-12 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {/* Badge */}
        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-indigo-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
          ALL DECKS
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-400 to-indigo-400 bg-clip-text text-transparent">
            Battle Decks
          </span>
        </h1>
        <p className="mt-3 max-w-md text-center text-sm text-white/50 sm:text-base">
          Pick a deck below and jump into a battle.
        </p>

        {/* Create new deck button — only shown when there's a list above it to sit alongside */}
        {!isLoading && !loadError && decks.length > 0 && (
          <Link
            href="/create"
            className="group relative mt-6 inline-flex w-full max-w-xs items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_40px_-10px_rgba(79,70,229,0.6)] transition-transform duration-200 active:scale-95 sm:mt-8 sm:w-auto sm:hover:scale-105"
          >
            <span className="relative z-10">+ Create New Deck</span>
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
          </Link>
        )}

        {/* Loading state -- shaped like the real deck-card grid below (badge,
            title, two meta rows, two stacked buttons) rather than a bare
            spinner, so mounting the real grid doesn't reflow/shift the page. */}
        {isLoading && (
          <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6"
              >
                <div className="min-w-0">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-5 w-4/5" />
                  <Skeleton className="mt-4 h-3 w-1/2" />
                  <Skeleton className="mt-1.5 h-3 w-1/3" />
                </div>
                <div className="mt-6 flex flex-col gap-2.5">
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!isLoading && loadError && (
          <div className="mt-8 w-full max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-center sm:mt-10 sm:p-6">
            <h2 className="text-lg font-bold text-red-300">
              Couldn&apos;t load decks
            </h2>
            <p className="mt-2 text-sm text-red-200/80">{loadError}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/80 transition-colors duration-150 hover:bg-white/10"
              >
                Try Again
              </button>
              <Link
                href="/demo/battle"
                className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white"
              >
                Try Demo Battle
              </Link>
            </div>
          </div>
        )}

        {/* Empty state — motivates creating the first deck */}
        {!isLoading && !loadError && decks.length === 0 && (
          <div className="mt-12 flex w-full max-w-md flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center backdrop-blur-sm sm:mt-16 sm:px-8 sm:py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/20">
              <svg
                className="h-7 w-7 text-indigo-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                />
              </svg>
            </div>

            <h2 className="mt-5 text-lg font-bold text-white sm:text-xl">
              No battle decks yet
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">
              Turn your notes or a PDF into a 90-second quiz battle in under
              a minute — then challenge a friend to beat your score.
            </p>

            <Link
              href="/demo/battle"
              className="mt-4 w-full rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-6 py-3.5 text-sm font-bold text-indigo-200 backdrop-blur-sm transition-colors duration-150 hover:border-indigo-300/40 hover:bg-indigo-500/15 sm:w-auto"
            >
              Try Demo Deck First
            </Link>

            <Link
              href="/create"
              className="group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_40px_-10px_rgba(79,70,229,0.6)] transition-transform duration-200 active:scale-95 sm:w-auto sm:px-8 sm:hover:scale-105"
            >
              <span className="relative z-10">Create Your First Deck</span>
              <svg
                className="relative z-10 h-4 w-4 flex-shrink-0 transition-transform duration-200 group-hover:translate-x-1"
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
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
            </Link>

            <p className="mt-4 text-xs text-white/30">
              Takes about a minute — paste notes or upload a PDF.
            </p>
          </div>
        )}

        {/* Deck grid */}
        {!isLoading && !loadError && decks.length > 0 && (
          <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            <div className="group flex flex-col justify-between rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.06] p-5 backdrop-blur-sm transition-colors duration-200 hover:border-indigo-300/40 hover:bg-indigo-500/[0.1] sm:p-6">
              <div className="min-w-0">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  {DEMO_DECK.course_name}
                </span>
                <h3 className="mt-2 break-words text-lg font-bold leading-snug text-white">
                  {DEMO_DECK.title}
                </h3>

                <div className="mt-4 flex items-center gap-2 text-xs text-indigo-100/80">
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
                  <span className="truncate">{DEMO_DECK.student_name}</span>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                <Link
                  href="/demo/battle"
                  className="group/btn relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border border-indigo-300/40 bg-indigo-500/20 px-6 py-3.5 text-sm font-bold text-indigo-100 transition-transform duration-200 active:scale-95 sm:py-3 sm:hover:scale-[1.02]"
                >
                  <span className="relative z-10">Play Demo Battle</span>
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
                </Link>
              </div>
            </div>

            {decks.map((deck) => (
              <HoverLiftArticle
                key={deck.id}
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-colors duration-200 hover:border-indigo-400/30 hover:bg-white/[0.06] sm:p-6"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
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
                    className="group/btn relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(79,70,229,0.5)] transition-transform duration-200 active:scale-95 sm:py-3 sm:hover:scale-[1.02]"
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

                  <Button href={`/decks/${deck.id}`} variant="ghost">
                    View Deck
                  </Button>
                </div>
              </HoverLiftArticle>
            ))}
          </div>
        )}

        {!isLoading && !loadError && hasMoreDecks && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMoreDecks()}
              disabled={isLoadingMore}
              className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/85 backdrop-blur-sm transition-colors duration-150 hover:border-indigo-400/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingMore ? "Loading more decks..." : "Load more decks"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}