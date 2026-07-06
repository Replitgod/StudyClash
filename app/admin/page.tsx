"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";

type AdminStats = {
  totalUsers: number;
  totalDecks: number;
  totalBattles: number;
  totalFeedbackReports: number;
  totalQuestionReports: number;
  decksToday: number;
  battlesToday: number;
  generationsToday: number;
};

type AdminAnalytics = {
  eventsToday: number;
  pageViewsToday: number;
  deckGenerationStartedToday: number;
  deckGenerationSuccessToday: number;
  deckGenerationFailedToday: number;
  battleStartedToday: number;
  battleFinishedToday: number;
  feedbackSubmittedToday: number;
  questionReportSubmittedToday: number;
};

type FeedbackReport = {
  id: string;
  message: string;
  page_url: string | null;
  created_at: string;
};

type QuestionReport = {
  id: string;
  question_id: string;
  deck_id: string;
  reason: string;
  created_at: string;
};

type RecentDeck = {
  id: string;
  title: string;
  course_name: string;
  student_name: string;
  created_at: string;
};

type AnalyticsEvent = {
  id: string;
  user_id: string | null;
  event_name: string;
  page_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AdminData = {
  stats: AdminStats;
  analytics: AdminAnalytics;
  recent: {
    feedback: FeedbackReport[];
    questionReports: QuestionReport[];
    decks: RecentDeck[];
    events: AnalyticsEvent[];
  };
};

// Defined OUTSIDE the page component so it keeps a stable identity across
// re-renders, preventing the whole subtree from remounting on state changes.
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
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center px-4 py-10 sm:px-6 sm:py-16">
        {children}
      </div>
    </main>
  );
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Small readable labels for raw event_name values, e.g. "battle_started"
// -> "Battle Started". Falls back to the raw name if not mapped.
function formatEventName(eventName: string): string {
  const map: Record<string, string> = {
    page_view: "Page View",
    signup_completed: "Signup Completed",
    login_completed: "Login Completed",
    deck_create_opened: "Deck Create Opened",
    deck_generation_started: "Deck Generation Started",
    deck_generation_success: "Deck Generation Success",
    deck_generation_failed: "Deck Generation Failed",
    battle_started: "Battle Started",
    battle_finished: "Battle Finished",
    feedback_submitted: "Feedback Submitted",
    question_report_submitted: "Question Report Submitted",
  };
  return map[eventName] || eventName;
}

// Small reusable empty-state block for the recent-activity panels
function EmptyPanelState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="mt-4 flex flex-col items-center rounded-xl border border-white/5 bg-black/20 px-4 py-8 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-white/30">
        {icon}
      </div>
      <p className="mt-3 text-xs text-white/40">{message}</p>
    </div>
  );
}

export default function AdminPage() {
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [data, setData] = useState<AdminData | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      setIsLoadingStats(true);
      setAccessError(null);

      try {
        const response = await authFetch("/api/admin/stats", {
          method: "GET",
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          setAccessError(`Server error (status ${response.status}).`);
          setIsLoadingStats(false);
          return;
        }

        const json = await response.json();

        if (!response.ok) {
          setAccessError(json.error || "Failed to load admin dashboard.");
          setIsLoadingStats(false);
          return;
        }

        setData(json);
        setIsLoadingStats(false);
      } catch (err) {
        setAccessError(
          err instanceof Error ? err.message : "Failed to load admin dashboard."
        );
        setIsLoadingStats(false);
      }
    }

    if (isLoggedIn) {
      loadStats();
    }
  }, [isLoggedIn]);

  // ---------- Auth loading state ----------
  if (isAuthLoading) {
    return (
      <Background>
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
        <p className="mt-4 text-sm text-white/50">Loading...</p>
      </Background>
    );
  }

  // ---------- Not logged in ----------
  if (!isLoggedIn) {
    return (
      <Background>
        <div className="mt-16 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fuchsia-500/10">
            <svg
              className="h-6 w-6 text-fuchsia-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-bold text-white">
            Admin Access Required
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Log in with an admin account to view the dashboard.
          </p>
          <Link
            href="/login"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
          >
            Log In
          </Link>
        </div>
      </Background>
    );
  }

  // ---------- Loading stats ----------
  if (isLoadingStats) {
    return (
      <Background>
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
        <p className="mt-4 text-sm text-white/50">Loading dashboard...</p>
      </Background>
    );
  }

  // ---------- Logged in but not admin (or other access error) ----------
  if (accessError || !data) {
    const isForbidden = accessError === "You do not have admin access.";

    return (
      <Background>
        <div className="mt-16 w-full max-w-sm rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-6 w-6 text-red-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-bold text-red-300">
            {isForbidden ? "Access Denied" : "Something Went Wrong"}
          </h1>
          <p className="mt-2 text-sm text-red-200/80">
            {accessError || "Could not load the admin dashboard."}
          </p>
          <Link
            href="/account"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/80 transition-colors duration-150 hover:border-white/20 hover:bg-white/10"
          >
            Back to Account
          </Link>
        </div>
      </Background>
    );
  }

  // ---------- Admin dashboard ----------
  const { stats, analytics, recent } = data;

  const statCards = [
    { label: "Total Users", value: stats.totalUsers, color: "text-fuchsia-300" },
    { label: "Total Decks", value: stats.totalDecks, color: "text-cyan-300" },
    { label: "Total Battles", value: stats.totalBattles, color: "text-violet-300" },
    { label: "Feedback Reports", value: stats.totalFeedbackReports, color: "text-emerald-300" },
    { label: "Question Reports", value: stats.totalQuestionReports, color: "text-red-300" },
    { label: "Decks Today", value: stats.decksToday, color: "text-cyan-300" },
    { label: "Battles Today", value: stats.battlesToday, color: "text-violet-300" },
    { label: "Generations Today", value: stats.generationsToday, color: "text-fuchsia-300" },
  ];

  const analyticsCards = [
    { label: "Events Today", value: analytics.eventsToday, color: "text-white" },
    { label: "Page Views Today", value: analytics.pageViewsToday, color: "text-cyan-300" },
    { label: "Deck Gen Started", value: analytics.deckGenerationStartedToday, color: "text-fuchsia-300" },
    { label: "Deck Gen Success", value: analytics.deckGenerationSuccessToday, color: "text-emerald-300" },
    { label: "Deck Gen Failed", value: analytics.deckGenerationFailedToday, color: "text-red-300" },
    { label: "Battles Started", value: analytics.battleStartedToday, color: "text-violet-300" },
    { label: "Battles Finished", value: analytics.battleFinishedToday, color: "text-violet-300" },
    { label: "Feedback Submitted", value: analytics.feedbackSubmittedToday, color: "text-emerald-300" },
    { label: "Question Reports Submitted", value: analytics.questionReportSubmittedToday, color: "text-red-300" },
  ];

  const hasAnalyticsToday = analytics.eventsToday > 0;

  return (
    <Background>
      {/* Badge */}
      <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
        ADMIN ONLY
      </div>

      {/* Title */}
      <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
        <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
          Admin Dashboard
        </span>
      </h1>
      <p className="mt-3 max-w-md text-center text-sm text-white/50 sm:text-base">
        Live overview of StudyClash usage and reports.
      </p>

      {/* Stat grid */}
      <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-4 sm:gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center backdrop-blur-sm sm:p-5"
          >
            <p className={`text-2xl font-black sm:text-3xl ${card.color}`}>
              {card.value}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
              {card.label}
            </p>
          </div>
        ))}
      </div>

      {/* Analytics section */}
      <div className="mt-10 w-full sm:mt-12">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 flex-shrink-0 text-cyan-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">
            Today&apos;s Analytics
          </p>
        </div>

        {!hasAnalyticsToday ? (
          <div className="mt-4 flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-10 text-center backdrop-blur-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-white/30">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
            <p className="mt-3 text-sm font-semibold text-white/70">
              No analytics data yet today
            </p>
            <p className="mt-1 max-w-sm text-xs text-white/40">
              Events will appear here as users browse, generate decks, and
              play battles today. Check back once traffic comes in.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {analyticsCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center backdrop-blur-sm sm:p-5"
              >
                <p className={`text-2xl font-black sm:text-3xl ${card.color}`}>
                  {card.value}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/40 sm:text-xs">
                  {card.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent data grid */}
      <div className="mt-10 grid w-full grid-cols-1 gap-5 sm:mt-12 lg:grid-cols-3">
        {/* Recent decks */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
            Latest Decks
          </p>
          {recent.decks.length === 0 ? (
            <EmptyPanelState
              message="No decks created yet."
              icon={
                <svg
                  className="h-4.5 w-4.5"
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
              }
            />
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {recent.decks.map((deck) => (
                <div
                  key={deck.id}
                  className="rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <p className="break-words text-sm font-bold text-white/90">
                    {deck.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-white/40">
                    {deck.course_name} · {deck.student_name}
                  </p>
                  <p className="mt-1 text-[10px] text-white/30">
                    {formatDateTime(deck.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent feedback */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">
            Latest Feedback
          </p>
          {recent.feedback.length === 0 ? (
            <EmptyPanelState
              message="No feedback submitted yet."
              icon={
                <svg
                  className="h-4.5 w-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
              }
            />
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {recent.feedback.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <p className="break-words text-sm text-white/80">
                    {item.message}
                  </p>
                  <p className="mt-1.5 truncate text-[10px] text-white/30">
                    {item.page_url || "Unknown page"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/30">
                    {formatDateTime(item.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent question reports */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-red-300">
            Latest Question Reports
          </p>
          {recent.questionReports.length === 0 ? (
            <EmptyPanelState
              message="No question reports yet."
              icon={
                <svg
                  className="h-4.5 w-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              }
            />
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {recent.questionReports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                    {report.reason}
                  </span>
                  <p className="mt-2 truncate text-[10px] text-white/40">
                    Question: {report.question_id}
                  </p>
                  <p className="truncate text-[10px] text-white/40">
                    Deck: {report.deck_id}
                  </p>
                  <p className="mt-1 text-[10px] text-white/30">
                    {formatDateTime(report.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Latest analytics events */}
      <div className="mt-10 w-full sm:mt-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">
            Latest 20 Events
          </p>

          {recent.events.length === 0 ? (
            <EmptyPanelState
              message="No data yet. Events will show up here once users start interacting with the app."
              icon={
                <svg
                  className="h-4.5 w-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
                  />
                </svg>
              }
            />
          ) : (
            <div className="mt-4 overflow-x-auto">
              <div className="flex min-w-[640px] flex-col gap-2">
                {/* Header row (hidden on very small screens to save space) */}
                <div className="hidden grid-cols-12 gap-3 px-3 text-[10px] font-bold uppercase tracking-wider text-white/30 sm:grid">
                  <span className="col-span-3">Event</span>
                  <span className="col-span-4">Page</span>
                  <span className="col-span-3">Metadata</span>
                  <span className="col-span-2">Time</span>
                </div>

                {recent.events.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-12 items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
                  >
                    <div className="col-span-3">
                      <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                        {formatEventName(event.event_name)}
                      </span>
                    </div>
                    <p className="col-span-4 truncate text-[11px] text-white/50">
                      {event.page_url || "—"}
                    </p>
                    <p className="col-span-3 truncate text-[11px] text-white/40">
                      {event.metadata
                        ? JSON.stringify(event.metadata)
                        : "—"}
                    </p>
                    <p className="col-span-2 text-[10px] text-white/30">
                      {formatDateTime(event.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Background>
  );
}