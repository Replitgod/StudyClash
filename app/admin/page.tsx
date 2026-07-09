"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { FLOATING_ACTION } from "@/lib/uiLayout";

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
  classroomRoomCreatedToday: number;
  classroomInviteCopiedToday: number;
  classroomJoinSuccessToday: number;
  enterpriseLeadSubmittedToday: number;
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

type TutorStudyLink = {
  label: string;
  url: string;
};

type TutorWeakTopic = {
  topic: string;
  missedCount: number;
  studyLinks: TutorStudyLink[];
};

type TutorBattle = {
  id: string;
  deckTitle: string;
  courseName: string;
  score: number;
  accuracy: number;
  timeTakenSeconds: number;
  createdAt: string;
};

type TutorStudent = {
  id: string;
  name: string;
  email: string | null;
  totalBattles: number;
  latestScore: number;
  latestAccuracy: number;
  bestScore: number;
  trendLabel: string;
  parentSummary: string;
  recommendedNextSteps: string[];
  practicedDecks: string[];
  weakTopics: TutorWeakTopic[];
  recentBattles: TutorBattle[];
  lastActiveAt: string;
};

type TutorDashboardData = {
  students: TutorStudent[];
  activeStudents: number;
  classWeaknessClusters: Array<{
    topic: string;
    totalMisses: number;
    studentCount: number;
    affectedStudents: string[];
  }>;
  reteachRecommendations: Array<{
    topic: string;
    urgency: "high" | "medium" | "low";
    recommendation: string;
  }>;
  proofOfImprovement: {
    improvingStudents: number;
    holdingStudents: number;
    strugglingStudents: number;
  };
  emptyMessage: string;
};

type EnterpriseLeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

type EnterpriseLead = {
  id: string;
  email: string;
  organization: string;
  role: string | null;
  seats: string | null;
  message: string | null;
  status: EnterpriseLeadStatus;
  source: string;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
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
      <div className={`relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center px-4 py-10 sm:px-6 sm:py-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
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

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
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
    classroom_room_created: "Classroom Room Created",
    classroom_invite_copied: "Classroom Invite Copied",
    classroom_join_attempted: "Classroom Join Attempted",
    classroom_join_success: "Classroom Join Success",
    classroom_join_failed: "Classroom Join Failed",
    enterprise_lead_submitted: "Enterprise Lead Submitted",
    enterprise_lead_submit_failed: "Enterprise Lead Submit Failed",
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

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function buildParentReportCopy(student: TutorStudent): string {
  return [
    `Student: ${student.name}`,
    `Latest score: ${student.latestScore} pts`,
    `Accuracy: ${student.latestAccuracy}%`,
    `Best score: ${student.bestScore} pts`,
    `Trend: ${student.trendLabel}`,
    `Recent decks: ${student.practicedDecks.join(", ") || "No recent deck activity yet"}`,
    `Weak topics: ${student.weakTopics.map((topic) => `${topic.topic} (${topic.missedCount})`).join(", ") || "No obvious weak topics"}`,
    `Recommended next steps:`,
    ...(student.recommendedNextSteps.length
      ? student.recommendedNextSteps.map((step) => `- ${step}`)
      : ["- Review recent battles together"]),
  ].join("\n");
}

export default function AdminPage() {
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [data, setData] = useState<AdminData | null>(null);
  const [tutorDashboard, setTutorDashboard] = useState<TutorDashboardData | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingTutorDashboard, setIsLoadingTutorDashboard] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [enterpriseLeads, setEnterpriseLeads] = useState<EnterpriseLead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [isUpdatingLeadId, setIsUpdatingLeadId] = useState<string | null>(null);

  const selectedTutorStudent = tutorDashboard?.students.find(
    (student) => student.id === selectedStudentId
  ) || tutorDashboard?.students[0] || null;

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

  useEffect(() => {
    async function loadEnterpriseLeads() {
      setIsLoadingLeads(true);
      setLeadsError(null);

      try {
        const response = await authFetch("/api/admin/enterprise-leads", {
          method: "GET",
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          setLeadsError(`Server error (status ${response.status}).`);
          setIsLoadingLeads(false);
          return;
        }

        const json = (await response.json()) as {
          leads?: EnterpriseLead[];
          error?: string;
        };

        if (!response.ok) {
          setLeadsError(json.error || "Failed to load enterprise leads.");
          setIsLoadingLeads(false);
          return;
        }

        setEnterpriseLeads(json.leads || []);
        setIsLoadingLeads(false);
      } catch (err) {
        setLeadsError(
          err instanceof Error ? err.message : "Failed to load enterprise leads."
        );
        setIsLoadingLeads(false);
      }
    }

    if (isLoggedIn) {
      loadEnterpriseLeads();
    }
  }, [isLoggedIn]);

  const handleLeadStatusUpdate = async (
    leadId: string,
    status: EnterpriseLeadStatus
  ) => {
    if (isUpdatingLeadId) return;

    setIsUpdatingLeadId(leadId);
    setLeadsError(null);

    try {
      const response = await authFetch("/api/admin/enterprise-leads", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: leadId, status }),
      });

      const json = (await response.json()) as {
        lead?: EnterpriseLead;
        error?: string;
      };

      if (!response.ok || !json.lead) {
        throw new Error(json.error || "Failed to update lead.");
      }

      setEnterpriseLeads((prev) =>
        prev.map((lead) => (lead.id === leadId ? json.lead as EnterpriseLead : lead))
      );
    } catch (err) {
      setLeadsError(err instanceof Error ? err.message : "Failed to update lead.");
    } finally {
      setIsUpdatingLeadId(null);
    }
  };

  useEffect(() => {
    async function loadTutorDashboard() {
      setIsLoadingTutorDashboard(true);
      setTutorError(null);

      try {
        const response = await authFetch("/api/admin/tutor-dashboard", {
          method: "GET",
        });

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          setTutorError(`Server error (status ${response.status}).`);
          setIsLoadingTutorDashboard(false);
          return;
        }

        const json = await response.json();

        if (!response.ok) {
          setTutorError(json.error || "Failed to load tutor dashboard.");
          setIsLoadingTutorDashboard(false);
          return;
        }

        setTutorDashboard(json);
        setIsLoadingTutorDashboard(false);
      } catch (err) {
        setTutorError(
          err instanceof Error ? err.message : "Failed to load tutor dashboard."
        );
        setIsLoadingTutorDashboard(false);
      }
    }

    if (isLoggedIn) {
      loadTutorDashboard();
    }
  }, [isLoggedIn]);

  const handleCopyParentReport = async (student: TutorStudent) => {
    const reportCopy = buildParentReportCopy(student);

    try {
      await navigator.clipboard.writeText(reportCopy);
      setCopyStatus(`Copied ${student.name}'s report`);
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus("Unable to copy report right now");
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

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
    { label: "Classroom Rooms Created", value: analytics.classroomRoomCreatedToday, color: "text-amber-300" },
    { label: "Classroom Invites Copied", value: analytics.classroomInviteCopiedToday, color: "text-cyan-300" },
    { label: "Classroom Joins", value: analytics.classroomJoinSuccessToday, color: "text-emerald-300" },
    { label: "Enterprise Leads", value: analytics.enterpriseLeadSubmittedToday, color: "text-fuchsia-300" },
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
                    {deck.course_name} -+ {deck.student_name}
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

      <div className="mt-10 w-full sm:mt-12">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 flex-shrink-0 text-amber-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3v18m0-18h16.5M3.75 9h10.5m-10.5 6h16.5"
            />
          </svg>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
            Enterprise Lead Pipeline
          </p>
        </div>

        <p className="mt-2 max-w-2xl text-sm text-white/45">
          B2B pilot leads captured from classroom and pricing flows. Move each lead through the funnel to track conversion progress.
        </p>

        {leadsError && (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200/80">
            {leadsError}
          </div>
        )}

        {isLoadingLeads ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45 backdrop-blur-sm">
            Loading enterprise leads...
          </div>
        ) : enterpriseLeads.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45 backdrop-blur-sm">
            No enterprise leads yet.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {enterpriseLeads.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white/90">{lead.organization}</p>
                    <p className="mt-1 text-xs text-white/50">{lead.email}</p>
                    <p className="mt-1 text-[11px] text-white/35">
                      {lead.role || "Role unknown"}
                      {lead.seats ? ` · ${lead.seats} seats` : ""}
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                    {lead.status}
                  </span>
                </div>

                {lead.message && (
                  <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/70">
                    {lead.message}
                  </p>
                )}

                <p className="mt-3 text-[11px] text-white/35">
                  Captured: {formatDateTime(lead.created_at)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(["new", "contacted", "qualified", "won", "lost"] as EnterpriseLeadStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleLeadStatusUpdate(lead.id, status)}
                      disabled={isUpdatingLeadId === lead.id || lead.status === status}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 ${
                        lead.status === status
                          ? "border border-cyan-300/30 bg-cyan-500/15 text-cyan-200"
                          : "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tutor Center Progress Dashboard */}
      <div className="mt-10 w-full sm:mt-12">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 flex-shrink-0 text-fuchsia-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 20h5v-2a4 4 0 00-5-3.874M9 20H4v-2a4 4 0 015-3.874m0 0a4 4 0 110-7.752m0 7.752A4 4 0 0012 12m0 0a4 4 0 100-7.752m0 7.752A4 4 0 0012 12m0 0a4 4 0 117.658 1.5"
            />
          </svg>
          <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
            Tutor Center Progress Dashboard
          </p>
        </div>

        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Built for tutoring centers and parent updates: student activity, weak topics, improvement trends, and a clean report layout you can screenshot or share.
        </p>

        {copyStatus && (
          <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200">
            {copyStatus}
          </div>
        )}

        {isLoadingTutorDashboard ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm text-sm text-white/45">
            Loading student progress...
          </div>
        ) : tutorError ? (
          <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-200/80 backdrop-blur-sm">
            {tutorError}
          </div>
        ) : !tutorDashboard || tutorDashboard.students.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm text-sm text-white/45">
            {tutorDashboard?.emptyMessage || "Once students start battling, their progress will appear here."}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Improving Students</p>
                <p className="mt-2 text-2xl font-black text-emerald-200">{tutorDashboard.proofOfImprovement.improvingStudents}</p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Holding Steady</p>
                <p className="mt-2 text-2xl font-black text-cyan-200">{tutorDashboard.proofOfImprovement.holdingStudents}</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Needs Intervention</p>
                <p className="mt-2 text-2xl font-black text-amber-200">{tutorDashboard.proofOfImprovement.strugglingStudents}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-violet-300">Class Weakness Clusters</p>
                {tutorDashboard.classWeaknessClusters.length === 0 ? (
                  <p className="mt-3 text-sm text-white/45">No class weakness patterns yet.</p>
                ) : (
                  <div className="mt-4 flex flex-col gap-2.5">
                    {tutorDashboard.classWeaknessClusters.slice(0, 6).map((cluster) => (
                      <div key={cluster.topic} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-white/90">{cluster.topic}</p>
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">{cluster.totalMisses} misses</span>
                        </div>
                        <p className="mt-1 text-[11px] text-white/45">{cluster.studentCount} students affected</p>
                        <p className="mt-1 truncate text-[10px] text-white/35">{cluster.affectedStudents.join(", ")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Reteach Recommendations</p>
                {tutorDashboard.reteachRecommendations.length === 0 ? (
                  <p className="mt-3 text-sm text-white/45">No reteach recommendations available yet.</p>
                ) : (
                  <div className="mt-4 flex flex-col gap-2.5">
                    {tutorDashboard.reteachRecommendations.map((recommendation) => (
                      <div key={recommendation.topic} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-white/90">{recommendation.topic}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${recommendation.urgency === "high" ? "bg-red-500/15 text-red-300" : recommendation.urgency === "medium" ? "bg-amber-500/15 text-amber-300" : "bg-cyan-500/15 text-cyan-300"}`}
                          >
                            {recommendation.urgency}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-white/55">{recommendation.recommendation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Students</p>
              <div className="mt-4 flex flex-col gap-3">
                {tutorDashboard.students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setSelectedStudentId(student.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors duration-150 ${student.id === selectedTutorStudent?.id ? "border-fuchsia-400/30 bg-fuchsia-500/10" : "border-white/10 bg-black/20 hover:border-cyan-400/30 hover:bg-white/[0.04]"}`}
                  >
                    <p className="text-sm font-bold text-white/90">{student.name}</p>
                    <p className="mt-1 text-[11px] text-white/40">
                      {student.latestScore} pts · {student.latestAccuracy}% accuracy · {formatRelativeTime(student.lastActiveAt)}
                    </p>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/45">
                      {student.trendLabel}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {selectedTutorStudent && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Parent-Friendly Report</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-white">{selectedTutorStudent.name}</h2>
                    <p className="mt-1 text-sm text-white/45">Screenshot-ready summary for parents and tutors.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyParentReport(selectedTutorStudent)}
                    className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-200"
                  >
                    Copy Report
                  </button>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Latest Score</p><p className="mt-2 text-2xl font-black text-fuchsia-300">{selectedTutorStudent.latestScore} pts</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Accuracy</p><p className="mt-2 text-2xl font-black text-emerald-300">{selectedTutorStudent.latestAccuracy}%</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Best Score</p><p className="mt-2 text-2xl font-black text-violet-300">{selectedTutorStudent.bestScore} pts</p></div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Trend</p><p className="mt-2 text-lg font-bold text-cyan-300">{selectedTutorStudent.trendLabel}</p></div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/45">What the student practiced</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{selectedTutorStudent.parentSummary}</p>
                  <p className="mt-3 text-xs text-white/40">Recent decks: {selectedTutorStudent.practicedDecks.join(", ") || "No recent decks yet"}</p>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/45">Recent Battles</p>
                    <div className="mt-4 flex flex-col gap-2.5">
                      {selectedTutorStudent.recentBattles.map((battle) => (
                        <div key={battle.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-white/90">{battle.deckTitle}</p>
                              <p className="mt-1 truncate text-[11px] text-white/40">{battle.courseName}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-cyan-300">{battle.score} pts</p>
                              <p className="text-[11px] text-white/40">{battle.accuracy}% accuracy</p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-white/30">
                            <span>{formatRelativeTime(battle.createdAt)}</span>
                            <span>{formatTime(battle.timeTakenSeconds)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/45">Weak Topics</p>
                    <div className="mt-4 flex flex-col gap-3">
                      {selectedTutorStudent.weakTopics.map((topic) => (
                        <div key={topic.topic} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-white/90">{topic.topic}</p>
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">{topic.missedCount} missed</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {topic.studyLinks.map((link) => (
                              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-cyan-300">
                                {link.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-white/45">Recommended Next Steps</p>
                      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-white/70">
                        {selectedTutorStudent.recommendedNextSteps.map((step) => (
                          <li key={step} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-300" /><span>{step}</span></li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.03] p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Improvement over time</p>
                  <p className="mt-2 text-sm text-white/70">{selectedTutorStudent.trendLabel} based on the latest battles. Use rematches to reinforce weak topics and measure the next score change.</p>
                </div>
              </div>
            )}
            </div>
          </div>
        )}
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
                      {event.page_url || "--"}
                    </p>
                    <p className="col-span-3 truncate text-[11px] text-white/40">
                      {event.metadata
                        ? JSON.stringify(event.metadata)
                        : "--"}
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
