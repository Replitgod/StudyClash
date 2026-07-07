"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";

type PlanInfo = {
  id: string;
  label: string;
  daily_limit: number | null;
  description: string;
};

type DeckSummary = {
  id: string;
  title: string;
  course_name: string;
  created_at: string;
};

type MatchSummary = {
  id: string;
  deck_id: string;
  player_name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  time_taken_seconds: number;
  created_at: string;
  deck_title?: string;
};

type DeckInsight = {
  id: string;
  title: string;
  courseN: string;
  matchesPlayed?: number;
  averageAccuracy?: number;
  bestScore?: number;
  lastPlayedDate?: string;
};

type DeckInsights = {
  mostPlayed: DeckInsight[];
  strongest: DeckInsight[];
  weakest: DeckInsight[];
  recentlyPlayed: DeckInsight[];
  recommendedNextBattle: {
    id: string;
    title: string;
    courseN: string;
    reason: string;
  } | null;
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-10 sm:px-6 sm:py-16">
        {children}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  const { user, profile, isLoggedIn, isLoading } = useAuth();

  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [totalDecks, setTotalDecks] = useState(0);
  const [battlesPlayed, setBattlesPlayed] = useState(0);
  const [averageAccuracy, setAverageAccuracy] = useState(0);
  const [decksGeneratedToday, setDecksGeneratedToday] = useState(0);
  const [remainingGenerationsToday, setRemainingGenerationsToday] = useState<number | null>(null);
  const [recentDecks, setRecentDecks] = useState<DeckSummary[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchSummary[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deckInsights, setDeckInsights] = useState<DeckInsights>({
    mostPlayed: [],
    strongest: [],
    weakest: [],
    recentlyPlayed: [],
    recommendedNextBattle: null,
  });

  useEffect(() => {
    async function loadDashboard() {
      if (!user || !profile) return;

      setIsLoadingStats(true);
      setLoadError(null);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayIso = startOfToday.toISOString();

      try {
        const [{ data: planData, error: planError }, { data: deckData, error: deckError }, { data: matchData, error: matchError }, { data: generationData, error: generationError }] = await Promise.all([
          supabase
            .from("membership_plans")
            .select("id, label, daily_limit, description")
            .eq("id", profile.plan)
            .single(),
          supabase
            .from("decks")
            .select("id, title, course_name, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("matches")
            .select("id, deck_id, player_name, score, correct_answers, total_questions, time_taken_seconds, created_at")
            .in(
              "deck_id",
              (await supabase.from("decks").select("id").eq("user_id", user.id)).data?.map((deck: { id: string }) => deck.id) || []
            )
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("generation_logs")
            .select("id")
            .eq("user_id", user.id)
            .gte("created_at", startOfTodayIso),
        ]);

        if (planError) {
          throw planError;
        }

        if (deckError) {
          throw deckError;
        }

        if (matchError) {
          throw matchError;
        }

        if (generationError) {
          throw generationError;
        }

        const deckIds = (deckData || []).map((deck: { id: string }) => deck.id);

        if (deckIds.length > 0) {
          const { data: deckTitlesData, error: deckTitlesError } = await supabase
            .from("decks")
            .select("id, title")
            .in("id", deckIds);

          if (!deckTitlesError && deckTitlesData) {
            const titleMap = new Map(deckTitlesData.map((deck: { id: string; title: string }) => [deck.id, deck.title]));
            const matchesWithDeckTitles = (matchData || []).map((match: { deck_id: string }) => ({
              ...match,
              deck_title: titleMap.get(match.deck_id) || "Unknown deck",
            }));
            setRecentMatches(matchesWithDeckTitles);
          } else {
            setRecentMatches(matchData || []);
          }
        } else {
          setRecentMatches([]);
        }

        const deckCount = deckData?.length ?? 0;
        const battlesCount = matchData?.length ?? 0;
        const totalQuestions = (matchData || []).reduce((sum: number, match: { total_questions: number | null }) => sum + (match.total_questions || 0), 0);
        const correctAnswers = (matchData || []).reduce((sum: number, match: { correct_answers: number | null }) => sum + (match.correct_answers || 0), 0);
        const average = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
        const generationCount = generationData?.length ?? 0;
        const dailyLimit = planData?.daily_limit;
        const remaining = dailyLimit == null ? null : Math.max(0, dailyLimit - generationCount);

        setPlanInfo(planData);
        setTotalDecks(deckCount);
        setBattlesPlayed(battlesCount);
        setAverageAccuracy(average);
        setDecksGeneratedToday(generationCount);
        setRemainingGenerationsToday(remaining);
        setRecentDecks(deckData || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "We could not load your dashboard right now.";
        setLoadError(message);
      } finally {
        setIsLoadingStats(false);
      }
    }

    if (isLoggedIn && user && profile) {
      loadDashboard();
    } else if (!isLoading) {
      void Promise.resolve().then(() => setIsLoadingStats(false));
    }
  }, [isLoggedIn, user, profile, isLoading]);

  // Fetch deck insights (Most Played, Strongest, etc.)
  useEffect(() => {
    async function loadDeckInsights() {
      if (!isLoggedIn || !user) return;

      try {
        const response = await authFetch("/api/deck-insights", {
          method: "GET",
        });

        const data = await response.json();

        if (!response.ok) {
          // Silently fail for insights — not critical
          console.error("Failed to load deck insights:", data);
          return;
        }

        setDeckInsights(data);
      } catch (err) {
        console.error("Error fetching deck insights:", err);
      }
    }

    loadDeckInsights();
  }, [isLoggedIn, user]);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <Background>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <svg className="h-10 w-10 animate-spin text-fuchsia-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="mt-4 text-sm text-white/50">Preparing your dashboard...</p>
        </div>
      </Background>
    );
  }

  if (!isLoggedIn) {
    return (
      <Background>
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fuchsia-500/10">
              <svg className="h-6 w-6 text-fuchsia-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-white">Sign in to see your dashboard</h1>
            <p className="mt-2 text-sm text-white/50">Track your decks, matches, and daily generation usage from one place.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/demo/battle" className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-5 py-3 text-sm font-bold text-cyan-200">
                Try Demo Battle
              </Link>
              <Link href="/login?redirect=/dashboard" className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-3 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)]">
                Log In
              </Link>
              <Link href="/signup?redirect=/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/90">
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </Background>
    );
  }

  return (
    <Background>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-fuchsia-300">
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
              STUDENT DASHBOARD
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Your StudyClash Hub
              </span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55 sm:text-base">
              Review your decks, check recent battles, and stay on top of your daily generation limit.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/demo/battle" className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200 text-center">
              Try Demo Battle
            </Link>
            <Link href="/create" className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] text-center">
              Create Deck
            </Link>
            <Link href="/decks" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/90 text-center">
              View My Decks
            </Link>
            <Link href="/pricing" className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-200 text-center">
              Pricing
            </Link>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
            {loadError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Total decks created</p>
            <p className="mt-3 text-3xl font-black text-white">{isLoadingStats ? "—" : totalDecks}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Battles played</p>
            <p className="mt-3 text-3xl font-black text-white">{isLoadingStats ? "—" : battlesPlayed}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Average accuracy</p>
            <p className="mt-3 text-3xl font-black text-white">{isLoadingStats ? "—" : `${averageAccuracy}%`}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Decks generated today</p>
            <p className="mt-3 text-3xl font-black text-white">{isLoadingStats ? "—" : decksGeneratedToday}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Remaining generations today</p>
            <p className="mt-3 text-3xl font-black text-white">
              {isLoadingStats ? "—" : remainingGenerationsToday == null ? "Unlimited" : remainingGenerationsToday}
            </p>
            {planInfo?.label ? <p className="mt-2 text-sm text-white/45">{planInfo.label}</p> : null}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Plan</p>
            <p className="mt-3 text-xl font-bold text-fuchsia-300">{profile?.plan || "free_beta"}</p>
            <p className="mt-2 text-sm text-white/45">{planInfo?.description || "Daily generation limits apply based on your plan."}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Recent decks</p>
                <h2 className="text-lg font-bold text-white">Your latest creations</h2>
              </div>
              <Link href="/decks" className="text-sm font-semibold text-fuchsia-300">View all</Link>
            </div>

            {isLoadingStats ? (
              <div className="flex items-center gap-2 py-4 text-sm text-white/45">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Loading your decks...
              </div>
            ) : recentDecks.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
                No decks yet. Create your first one to start building your study library.
              </div>
            ) : (
              <div className="space-y-3">
                {recentDecks.map((deck) => (
                  <Link key={deck.id} href={`/decks/${deck.id}`} className="flex items-start justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition-colors hover:border-fuchsia-400/30">
                    <div>
                      <p className="text-sm font-semibold text-white">{deck.title}</p>
                      <p className="mt-1 text-xs text-white/45">{deck.course_name}</p>
                    </div>
                    <span className="text-xs text-white/40">{formatDate(deck.created_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Recent matches</p>
                <h2 className="text-lg font-bold text-white">Latest battle results</h2>
              </div>
            </div>

            {isLoadingStats ? (
              <div className="flex items-center gap-2 py-4 text-sm text-white/45">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Loading recent matches...
              </div>
            ) : recentMatches.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
                No battles yet. Challenge yourself with one of your decks.
              </div>
            ) : (
              <div className="space-y-3">
                {recentMatches.map((match) => (
                  <div key={match.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{match.player_name}</p>
                        <p className="mt-1 text-xs text-white/45">{match.deck_title || "Study deck"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-fuchsia-300">{match.score} pts</p>
                        <p className="text-xs text-white/40">{formatTime(match.time_taken_seconds)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-white/45">
                      <span>{match.correct_answers}/{match.total_questions} correct</span>
                      <span>{formatDate(match.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deck Insights */}
          {battlesPlayed === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
              <p className="text-center text-sm text-white/50">
                Play a battle to unlock deck insights.
              </p>
            </div>
          ) : (
            <>
              {/* Recommended Next Battle */}
              {deckInsights.recommendedNextBattle && (
                <div className="rounded-2xl border-2 border-gradient-to-r from-fuchsia-500/30 to-cyan-500/30 bg-gradient-to-br from-fuchsia-500/[0.05] to-cyan-500/[0.05] p-5 backdrop-blur-sm sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-fuchsia-300">
                        Recommended Next Battle
                      </p>
                      <h2 className="text-lg font-bold text-white">
                        {deckInsights.recommendedNextBattle.reason}
                      </h2>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-base font-bold text-white">
                        {deckInsights.recommendedNextBattle.title}
                      </p>
                      <p className="mt-1 text-sm text-white/50">
                        {deckInsights.recommendedNextBattle.courseN}
                      </p>
                    </div>
                    <Link
                      href={`/battle/${deckInsights.recommendedNextBattle.id}`}
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-105"
                    >
                      Start Battle
                      <svg
                        className="h-4 w-4"
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
              )}

              {/* Deck Insights Grid */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* Most Played */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                      Most Played
                    </p>
                    <h3 className="text-lg font-bold text-white">Your go-to decks</h3>
                  </div>
                  {deckInsights.mostPlayed.length === 0 ? (
                    <p className="text-sm text-white/40">No decks played yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {deckInsights.mostPlayed.map((deck) => (
                        <div
                          key={deck.id}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {deck.title}
                            </p>
                            <p className="text-xs text-white/40">{deck.courseN}</p>
                          </div>
                          <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                            <span className="rounded-full bg-fuchsia-500/20 px-2 py-1 text-xs font-bold text-fuchsia-300">
                              {deck.matchesPlayed} plays
                            </span>
                            <Link
                              href={`/battle/${deck.id}`}
                              className="text-fuchsia-300 hover:text-fuchsia-200"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Strongest */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                      Strongest
                    </p>
                    <h3 className="text-lg font-bold text-white">Your best decks</h3>
                  </div>
                  {deckInsights.strongest.length === 0 ? (
                    <p className="text-sm text-white/40">No decks analyzed yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {deckInsights.strongest.map((deck) => (
                        <div
                          key={deck.id}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {deck.title}
                            </p>
                            <p className="text-xs text-white/40">{deck.courseN}</p>
                            <p className="mt-0.5 text-xs text-emerald-300">
                              {deck.averageAccuracy}% avg • Best: {deck.bestScore}%
                            </p>
                          </div>
                          <Link
                            href={`/battle/${deck.id}`}
                            className="ml-2 flex-shrink-0 text-emerald-300 hover:text-emerald-200"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Weakest */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                      Weakest
                    </p>
                    <h3 className="text-lg font-bold text-white">Review these</h3>
                  </div>
                  {deckInsights.weakest.length === 0 ? (
                    <p className="text-sm text-white/40">All decks look strong!</p>
                  ) : (
                    <div className="space-y-2">
                      {deckInsights.weakest.map((deck) => (
                        <div
                          key={deck.id}
                          className="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-500/[0.05] px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {deck.title}
                            </p>
                            <p className="text-xs text-white/40">{deck.courseN}</p>
                            <p className="mt-0.5 text-xs text-amber-300">
                              {deck.averageAccuracy}% avg • {deck.matchesPlayed} matches
                            </p>
                          </div>
                          <Link
                            href={`/battle/${deck.id}`}
                            className="ml-2 flex-shrink-0 text-amber-300 hover:text-amber-200"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recently Played */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                      Recently Played
                    </p>
                    <h3 className="text-lg font-bold text-white">Latest battles</h3>
                  </div>
                  {deckInsights.recentlyPlayed.length === 0 ? (
                    <p className="text-sm text-white/40">No recent matches.</p>
                  ) : (
                    <div className="space-y-2">
                      {deckInsights.recentlyPlayed.map((deck) => (
                        <div
                          key={deck.id}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {deck.title}
                            </p>
                            <p className="text-xs text-white/40">{deck.courseN}</p>
                            {deck.lastPlayedDate && (
                              <p className="mt-0.5 text-xs text-cyan-300">
                                {formatDate(deck.lastPlayedDate)}
                              </p>
                            )}
                          </div>
                          <Link
                            href={`/battle/${deck.id}`}
                            className="ml-2 flex-shrink-0 text-cyan-300 hover:text-cyan-200"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Background>
  );
}
