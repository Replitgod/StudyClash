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

type AdminData = {
  stats: AdminStats;
  recent: {
    feedback: FeedbackReport[];
    questionReports: QuestionReport[];
    decks: RecentDeck[];
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
  const { stats, recent } = data;

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

      {/* Recent data grid */}
      <div className="mt-8 grid w-full grid-cols-1 gap-5 sm:mt-10 lg:grid-cols-3">
        {/* Recent decks */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
            Latest Decks
          </p>
          {recent.decks.length === 0 ? (
            <p className="mt-3 text-sm text-white/40">No decks yet.</p>
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
            <p className="mt-3 text-sm text-white/40">No feedback yet.</p>
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
            <p className="mt-3 text-sm text-white/40">No reports yet.</p>
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
    </Background>
  );
}