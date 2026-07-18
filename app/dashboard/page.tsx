"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import dynamic from "next/dynamic";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { Button } from "@/app/components/ui/Button";
import { StatCard } from "@/app/components/ui/StatCard";
import {
  ACHIEVEMENTS,
  calculateLevel,
  getNextMilestoneXp,
  getProgressStorageKey,
  getRankInfo,
  getSeasonProgress,
  loadProgressSnapshot,
} from "@/lib/playerProgress";

// Closed-by-default chat widget -- code-split out of the main chunk so it
// doesn't block first paint/hydration of the dashboard's actual content.
const VyraCoach = dynamic(() => import("@/app/components/VyraCoach"), {
  ssr: false,
});

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

type DashboardNotification = {
  id: string;
  event_type: string;
  title: string;
  message: string;
  action_href: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
};

type ClassroomRoom = {
  id: string;
  owner_user_id: string;
  room_code: string;
  title: string;
  deck_id: string | null;
  deck_title?: string | null;
  is_live: boolean;
  mode?: string;
  created_at: string;
  updated_at: string;
  launch_href?: string | null;
  share_code?: string;
  join_href?: string;
  tournament_href?: string | null;
};

type RoomLimitNotice = {
  planId: string;
  roomLimit: number;
  currentActiveRooms: number;
  upgradeRequired: boolean;
  upgradeHref?: string;
};

type GoalProgressState = {
  dailyBattles: number;
  weeklyBattles: number;
  weeklyAccuracy: number;
};

type StudyPlanTaskSummary = {
  id: string;
  title: string;
  scheduled_date: string;
  completed: boolean;
  estimated_minutes: number;
};

type StudyPlanSummary = {
  id: string;
  title: string;
  assessment_name: string | null;
  assessment_date: string;
  todayTasks: StudyPlanTaskSummary[];
  overdueCount: number;
  weekCompletionPercent: number;
};

type LocalProgressState = {
  totalXp: number;
  currentStreakDays: number;
  bestStreakDays: number;
  unlockedAchievementIds: string[];
  historyAccuracies: number[];
};

function Background({ children }: { children: React.ReactNode }) {
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
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-10 pb-28 sm:px-6 sm:py-16 sm:pb-24">
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
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [classroomRooms, setClassroomRooms] = useState<ClassroomRoom[]>([]);
  const [isRoomsLoading, setIsRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [roomTitleInput, setRoomTitleInput] = useState("Friday Exam Sprint");
  const [roomDeckIdInput, setRoomDeckIdInput] = useState<string>("");
  const [roomModeInput, setRoomModeInput] = useState<"practice" | "tournament">("practice");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomInviteStatus, setRoomInviteStatus] = useState<string | null>(null);
  const [roomLimitNotice, setRoomLimitNotice] = useState<RoomLimitNotice | null>(null);
  const [renderTimestampMs] = useState(() => Date.now());
  const [deckInsights, setDeckInsights] = useState<DeckInsights>({
    mostPlayed: [],
    strongest: [],
    weakest: [],
    recentlyPlayed: [],
    recommendedNextBattle: null,
  });
  const [goalProgress, setGoalProgress] = useState<GoalProgressState>({
    dailyBattles: 0,
    weeklyBattles: 0,
    weeklyAccuracy: 0,
  });
  const [localProgress, setLocalProgress] = useState<LocalProgressState | null>(null);
  const [studyPlans, setStudyPlans] = useState<StudyPlanSummary[]>([]);
  const [isLoadingStudyPlans, setIsLoadingStudyPlans] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      if (!user || !profile) return;

      setIsLoadingStats(true);
      setLoadError(null);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfTodayIso = startOfToday.toISOString();

      try {
        const [
          { data: planData, error: planError },
          { data: recentDeckData, error: recentDeckError },
          { count: totalDeckCount, error: totalDeckCountError },
          { data: generationData, error: generationError },
          { data: allDeckIdsData, error: allDeckIdsError },
        ] = await Promise.all([
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
            .from("decks")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("generation_logs")
            .select("id")
            .eq("user_id", user.id)
            .gte("created_at", startOfTodayIso),
          supabase.from("decks").select("id, title").eq("user_id", user.id),
        ]);

        if (planError) {
          throw planError;
        }

        if (recentDeckError) {
          throw recentDeckError;
        }

        if (generationError) {
          throw generationError;
        }

        if (totalDeckCountError) {
          throw totalDeckCountError;
        }

        if (allDeckIdsError) {
          throw allDeckIdsError;
        }

        const allDecksLite = (allDeckIdsData || []) as Array<{ id: string; title: string }>;
        const allDeckIds = allDecksLite.map((deck) => deck.id);
        const deckTitleById = new Map(allDecksLite.map((deck) => [deck.id, deck.title]));

        let recentMatchesData: MatchSummary[] = [];
        let totalMatchesCount = 0;
        let average = 0;

        if (allDeckIds.length > 0) {
          const [
            { data: matchData, error: matchError },
            { data: allMatchStatsData, count: allMatchStatsCount, error: allMatchStatsError },
          ] = await Promise.all([
            supabase
              .from("matches")
              .select("id, deck_id, player_name, score, correct_answers, total_questions, time_taken_seconds, created_at")
              .in("deck_id", allDeckIds)
              .order("created_at", { ascending: false })
              .limit(5),
            supabase
              .from("matches")
              .select("correct_answers, total_questions, created_at", { count: "exact" })
              .in("deck_id", allDeckIds),
          ]);

          if (matchError) {
            throw matchError;
          }

          if (allMatchStatsError) {
            throw allMatchStatsError;
          }

          recentMatchesData = (matchData || []) as MatchSummary[];
          totalMatchesCount = allMatchStatsCount ?? 0;

          const totalQuestions = (allMatchStatsData || []).reduce(
            (sum: number, match: { total_questions: number | null }) =>
              sum + (match.total_questions || 0),
            0
          );
          const correctAnswers = (allMatchStatsData || []).reduce(
            (sum: number, match: { correct_answers: number | null }) =>
              sum + (match.correct_answers || 0),
            0
          );

          average = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

          const nowMs = Date.now();
          const startOfTodayMs = (() => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            return date.getTime();
          })();
          const weekStartMs = nowMs - 6 * 24 * 60 * 60 * 1000;

          const dailyBattles = (allMatchStatsData || []).filter((match) => {
            const createdAtMs = new Date(String(match.created_at || "")).getTime();
            return Number.isFinite(createdAtMs) && createdAtMs >= startOfTodayMs;
          }).length;

          const weeklyEntries = (allMatchStatsData || []).filter((match) => {
            const createdAtMs = new Date(String(match.created_at || "")).getTime();
            return Number.isFinite(createdAtMs) && createdAtMs >= weekStartMs;
          });

          const weeklyBattles = weeklyEntries.length;
          const weeklyAccuracy =
            weeklyEntries.length > 0
              ? Math.round(
                  (weeklyEntries.reduce(
                    (sum: number, match: { correct_answers: number | null }) =>
                      sum + (match.correct_answers || 0),
                    0
                  ) /
                    Math.max(
                      1,
                      weeklyEntries.reduce(
                        (sum: number, match: { total_questions: number | null }) =>
                          sum + (match.total_questions || 0),
                        0
                      )
                    )) *
                    100
                )
              : 0;

          setGoalProgress({
            dailyBattles,
            weeklyBattles,
            weeklyAccuracy,
          });
        }

        // Look up titles from the full deck-title map (built from allDecksLite,
        // not just the recent-5 query) so matches on any of the user's decks —
        // not only their 5 most-recently-created ones — resolve a real title
        // instead of falling back to "Unknown deck".
        const matchesWithDeckTitles = recentMatchesData.map((match) => ({
          ...match,
          deck_title: deckTitleById.get(match.deck_id) || "Unknown deck",
        }));
        setRecentMatches(matchesWithDeckTitles);

        const generationCount = generationData?.length ?? 0;
        const dailyLimit = planData?.daily_limit;
        const remaining = dailyLimit == null ? null : Math.max(0, dailyLimit - generationCount);

        setPlanInfo(planData);
        setTotalDecks(totalDeckCount ?? 0);
        setBattlesPlayed(totalMatchesCount);
        setAverageAccuracy(average);
        setDecksGeneratedToday(generationCount);
        setRemainingGenerationsToday(remaining);
        setRecentDecks(recentDeckData || []);
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

  useEffect(() => {
    async function loadStudyPlans() {
      if (!isLoggedIn || !user) {
        setStudyPlans([]);
        setIsLoadingStudyPlans(false);
        return;
      }

      try {
        const { data: plans } = await supabase
          .from("study_plans")
          .select("id, title, assessment_name, assessment_date")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("assessment_date", { ascending: true })
          .limit(5);

        const planRows = plans || [];
        const todayIso = new Date().toISOString().slice(0, 10);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekStartIso = weekStart.toISOString().slice(0, 10);

        const summaries = await Promise.all(
          planRows.map(async (plan) => {
            const { data: tasks } = await supabase
              .from("study_plan_tasks")
              .select("id, title, scheduled_date, completed, estimated_minutes")
              .eq("study_plan_id", plan.id)
              .gte("scheduled_date", weekStartIso);

            const allTasks = tasks || [];
            const todayTasks = allTasks.filter((t) => t.scheduled_date === todayIso);
            const overdueCount = allTasks.filter((t) => !t.completed && t.scheduled_date < todayIso).length;
            const weekTasks = allTasks.filter((t) => t.scheduled_date >= weekStartIso);
            const weekCompletionPercent =
              weekTasks.length > 0
                ? Math.round((weekTasks.filter((t) => t.completed).length / weekTasks.length) * 100)
                : 0;

            return {
              id: plan.id,
              title: plan.title,
              assessment_name: plan.assessment_name,
              assessment_date: plan.assessment_date,
              todayTasks,
              overdueCount,
              weekCompletionPercent,
            } as StudyPlanSummary;
          })
        );

        setStudyPlans(summaries);
      } catch (err) {
        console.error("Failed to load study plans:", err);
      } finally {
        setIsLoadingStudyPlans(false);
      }
    }

    loadStudyPlans();
  }, [isLoggedIn, user]);

  useEffect(() => {
    if (!user) {
      setLocalProgress(null);
      return;
    }

    const storageKey = getProgressStorageKey({
      userId: user.id,
      playerName: profile?.display_name || user.email || "guest",
    });
    const snapshot = loadProgressSnapshot(storageKey);

    setLocalProgress({
      totalXp: snapshot.totalXp,
      currentStreakDays: snapshot.currentStreakDays,
      bestStreakDays: snapshot.bestStreakDays,
      unlockedAchievementIds: snapshot.unlockedAchievementIds,
      historyAccuracies: snapshot.battleHistory.slice(0, 10).map((entry) => entry.accuracy),
    });
  }, [user, profile?.display_name, user?.email]);

  useEffect(() => {
    async function loadRooms() {
      if (!isLoggedIn || !user) {
        setClassroomRooms([]);
        setIsRoomsLoading(false);
        return;
      }

      setIsRoomsLoading(true);
      setRoomsError(null);

      try {
        const response = await authFetch("/api/classroom/rooms", { method: "GET" });
        const data = (await response.json()) as {
          rooms?: ClassroomRoom[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Failed to load classroom rooms.");
        }

        setClassroomRooms(data.rooms || []);
      } catch (err) {
        setRoomsError(
          err instanceof Error ? err.message : "Failed to load classroom rooms."
        );
      } finally {
        setIsRoomsLoading(false);
      }
    }

    loadRooms();
  }, [isLoggedIn, user]);

  const handleCreateRoom = async () => {
    if (!isLoggedIn || !user) return;
    if (isCreatingRoom) return;

    setIsCreatingRoom(true);
    setRoomsError(null);
    setRoomLimitNotice(null);

    try {
      const trimmedTitle = roomTitleInput.trim();
      if (!trimmedTitle) {
        throw new Error("Room title is required.");
      }

      if (roomModeInput === "tournament" && !roomDeckIdInput.trim()) {
        throw new Error("A tournament room needs a deck attached.");
      }

      const payload: { title: string; deckId?: string; mode?: string } = {
        title: trimmedTitle,
        mode: roomModeInput,
      };

      if (roomDeckIdInput.trim()) {
        payload.deckId = roomDeckIdInput.trim();
      }

      const response = await authFetch("/api/classroom/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        room?: ClassroomRoom;
        error?: string;
        code?: string;
        planId?: string;
        roomLimit?: number;
        currentActiveRooms?: number;
        upgradeRequired?: boolean;
        upgradeHref?: string;
      };

      if (!response.ok || !data.room) {
        if (
          data.code === "ROOM_LIMIT_REACHED" &&
          typeof data.planId === "string" &&
          typeof data.roomLimit === "number" &&
          typeof data.currentActiveRooms === "number"
        ) {
          setRoomLimitNotice({
            planId: data.planId,
            roomLimit: data.roomLimit,
            currentActiveRooms: data.currentActiveRooms,
            upgradeRequired: !!data.upgradeRequired,
            upgradeHref: data.upgradeHref,
          });
        }
        throw new Error(data.error || "Failed to create classroom room.");
      }

      void trackEvent("classroom_room_created", {
        roomId: data.room.id,
        deckId: payload.deckId || null,
      });

      setClassroomRooms((prev) => [data.room as ClassroomRoom, ...prev]);
      setRoomTitleInput("");
      setRoomDeckIdInput("");
      setRoomModeInput("practice");
    } catch (err) {
      setRoomsError(
        err instanceof Error ? err.message : "Failed to create classroom room."
      );
    } finally {
      setIsCreatingRoom(false);
    }
  };

  useEffect(() => {
    async function loadNotifications() {
      if (!isLoggedIn || !user) {
        setNotifications([]);
        setUnreadNotifications(0);
        setIsNotificationsLoading(false);
        return;
      }

      setIsNotificationsLoading(true);
      setNotificationsError(null);

      try {
        const response = await authFetch("/api/notifications?limit=10", {
          method: "GET",
        });

        const data = (await response.json()) as {
          notifications?: DashboardNotification[];
          unreadCount?: number;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Failed to load notifications.");
        }

        setNotifications(data.notifications || []);
        setUnreadNotifications(Number(data.unreadCount || 0));
      } catch (err) {
        setNotificationsError(
          err instanceof Error ? err.message : "Failed to load notifications."
        );
      } finally {
        setIsNotificationsLoading(false);
      }
    }

    loadNotifications();
  }, [isLoggedIn, user]);

  const markNotificationsRead = async (notificationIds?: string[]) => {
    if (!isLoggedIn || !user) return;
    if (isMarkingRead) return;

    setIsMarkingRead(true);
    setNotificationsError(null);

    try {
      const markAll = !notificationIds || notificationIds.length === 0;
      const response = await authFetch("/api/notifications/mark-read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          markAll
            ? { markAll: true }
            : {
                markAll: false,
                notificationIds,
              }
        ),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to update notifications.");
      }

      if (markAll) {
        setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
        setUnreadNotifications(0);
      } else {
        const idSet = new Set(notificationIds);
        setNotifications((prev) =>
          prev.map((item) =>
            idSet.has(item.id) ? { ...item, is_read: true } : item
          )
        );
        setUnreadNotifications((prev) => Math.max(0, prev - idSet.size));
      }
    } catch (err) {
      setNotificationsError(
        err instanceof Error ? err.message : "Failed to update notifications."
      );
    } finally {
      setIsMarkingRead(false);
    }
  };

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

  const copyRoomInvite = async (room: ClassroomRoom) => {
    const joinPath = room.join_href || `/classroom/join?code=${room.share_code || room.room_code}`;
    const inviteUrl = `${window.location.origin}${joinPath}`;
    const message = `${room.title} - Join with room code ${room.share_code || room.room_code}: ${inviteUrl}`;

    try {
      await navigator.clipboard.writeText(message);
      void trackEvent("classroom_invite_copied", {
        roomId: room.id,
        roomCode: room.share_code || room.room_code,
      });
      setRoomInviteStatus(`Invite copied for ${room.title}`);
      setTimeout(() => setRoomInviteStatus(null), 2000);
    } catch {
      setRoomInviteStatus("Could not copy invite link. Please copy the room code manually.");
      setTimeout(() => setRoomInviteStatus(null), 2500);
    }
  };

  const dueRematchDeck = deckInsights.recentlyPlayed.find((deck) => {
    if (!deck.lastPlayedDate) return false;
    const playedAt = new Date(deck.lastPlayedDate).getTime();
    if (Number.isNaN(playedAt)) return false;
    const daysSincePlayed = (renderTimestampMs - playedAt) / (1000 * 60 * 60 * 24);
    return daysSincePlayed >= 2;
  }) || null;

  const weakestDeck = deckInsights.weakest[0] || null;

  const trendDeltaPercent = (() => {
    if (recentMatches.length < 4) return null;

    const chronological = [...recentMatches].reverse();
    const midpoint = Math.floor(chronological.length / 2);
    const older = chronological.slice(0, midpoint);
    const newer = chronological.slice(midpoint);

    if (older.length === 0 || newer.length === 0) return null;

    const avgAccuracy = (items: MatchSummary[]) => {
      const values = items
        .map((match) =>
          match.total_questions > 0
            ? (match.correct_answers / match.total_questions) * 100
            : 0
        )
        .filter((value) => Number.isFinite(value));

      if (values.length === 0) return null;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const olderAvg = avgAccuracy(older);
    const newerAvg = avgAccuracy(newer);

    if (olderAvg === null || newerAvg === null) return null;
    return Math.round((newerAvg - olderAvg) * 10) / 10;
  })();

  const nextAction = (() => {
    if (weakestDeck) {
      return {
        title: "Focus your next battle",
        message: `You are weakest on ${weakestDeck.title}. Do a rematch to raise that average accuracy.`,
        href: `/battle/${weakestDeck.id}`,
        cta: "Practice weakest deck",
      };
    }

    if (dueRematchDeck) {
      return {
        title: "Keep retention high",
        message: `${dueRematchDeck.title} is due for rematch. Quick replay now helps lock in memory.`,
        href: `/battle/${dueRematchDeck.id}`,
        cta: "Start due rematch",
      };
    }

    if (deckInsights.recommendedNextBattle) {
      return {
        title: "Recommended next battle",
        message: deckInsights.recommendedNextBattle.reason,
        href: `/battle/${deckInsights.recommendedNextBattle.id}`,
        cta: "Start recommended",
      };
    }

    return null;
  })();

  const arenaTier = (() => {
    if (battlesPlayed >= 40 && averageAccuracy >= 88) return "Grandmaster";
    if (battlesPlayed >= 20 && averageAccuracy >= 78) return "Contender";
    if (battlesPlayed >= 8 && averageAccuracy >= 68) return "Challenger";
    if (battlesPlayed >= 3) return "Rookie";
    return "Unranked";
  })();

  const fallbackXp = battlesPlayed * 120 + averageAccuracy * 8;
  const totalXp = localProgress?.totalXp ?? fallbackXp;
  const levelInfo = calculateLevel(totalXp);
  const rankInfo = getRankInfo(totalXp, localProgress?.bestStreakDays || 0);
  const seasonInfo = getSeasonProgress(totalXp);
  const nextMilestoneXp = getNextMilestoneXp(totalXp);
  const unlockedAchievementLabels = (localProgress?.unlockedAchievementIds || [])
    .map((id) => ACHIEVEMENTS.find((achievement) => achievement.id === id)?.label)
    .filter((label): label is string => Boolean(label));

  const dailyGoalTarget = 2;
  const weeklyGoalTarget = 8;
  const weeklyAccuracyTarget = 72;
  const dailyGoalPercent = Math.min(100, Math.round((goalProgress.dailyBattles / dailyGoalTarget) * 100));
  const weeklyBattlePercent = Math.min(100, Math.round((goalProgress.weeklyBattles / weeklyGoalTarget) * 100));
  const weeklyAccuracyPercent = Math.min(100, Math.round((goalProgress.weeklyAccuracy / weeklyAccuracyTarget) * 100));
  const unlockedBadges = [
    battlesPlayed >= 1 ? "First Clash" : null,
    averageAccuracy >= 80 ? "Sharp Accuracy" : null,
    goalProgress.dailyBattles >= dailyGoalTarget ? "Daily Goal Cleared" : null,
    goalProgress.weeklyBattles >= weeklyGoalTarget && goalProgress.weeklyAccuracy >= weeklyAccuracyTarget
      ? "Weekly Training Complete"
      : null,
    battlesPlayed >= 20 ? "Battle Veteran" : null,
  ].filter((badge): badge is string => Boolean(badge));

  const combinedBadges = [
    ...new Set([...unlockedBadges, ...unlockedAchievementLabels]),
  ];

  const clashPathPulse = (() => {
    if (battlesPlayed === 0) {
      return {
        title: "Run your first battle",
        detail: "ClashPath activates after your first finished battle and builds your weak-topic roadmap.",
        href: "/decks",
        cta: "Choose a deck",
      };
    }

    if (nextAction) {
      return {
        title: nextAction.title,
        detail: nextAction.message,
        href: nextAction.href,
        cta: nextAction.cta,
      };
    }

    return {
      title: "Keep your streak moving",
      detail: "Play one focused rematch today to lock in retention and raise your arena tier.",
      href: "/decks",
      cta: "Start a battle",
    };
  })();

  const coachDeckId =
    deckInsights.recommendedNextBattle?.id ||
    weakestDeck?.id ||
    deckInsights.recentlyPlayed[0]?.id ||
    undefined;

  const coachWeakTopics = deckInsights.weakest
    .slice(0, 4)
    .map((deck) => deck.title);

  const coachMasteryProgress = [
    {
      label: "Overall Accuracy",
      value: averageAccuracy,
      details: `Across ${battlesPlayed} battles`,
    },
    ...deckInsights.strongest.slice(0, 2).map((deck) => ({
      label: `Strong: ${deck.title}`,
      value: deck.averageAccuracy,
      details: `Best ${deck.bestScore || 0}%`,
    })),
    ...deckInsights.weakest.slice(0, 2).map((deck) => ({
      label: `Weak: ${deck.title}`,
      value: deck.averageAccuracy,
      details: `${deck.matchesPlayed || 0} matches`,
    })),
  ];

  if (isLoading) {
    return (
      <Background>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <svg className="h-10 w-10 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
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
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
              <svg className="h-6 w-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold text-white">Sign in to see your dashboard</h1>
            <p className="mt-2 text-sm text-white/50">Track your decks, matches, and daily generation usage from one place.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button href="/demo/battle" variant="secondary">
                Try Demo Battle
              </Button>
              <Button href="/login?redirect=/dashboard" variant="primary">
                Log In
              </Button>
              <Button href="/signup?redirect=/dashboard" variant="ghost">
                Sign Up
              </Button>
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
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              STUDENT DASHBOARD
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              <span className="bg-gradient-to-r from-indigo-400 via-indigo-400 to-indigo-400 bg-clip-text text-transparent">
                Your StudyClash Hub
              </span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/55 sm:text-base">
              Review your decks, check recent battles, and stay on top of your daily generation limit.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/demo/battle" className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3 text-sm font-bold text-indigo-200 text-center">
              Try Demo Battle
            </Link>
            <Link href="/create" className="rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(79,70,229,0.6)] text-center">
              Create Deck
            </Link>
            <Link href="/decks" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/90 text-center">
              View My Decks
            </Link>
            <Link href="/mastery-map" className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-3 text-sm font-bold text-indigo-100 text-center">
              Mastery Map
            </Link>
            <Link href="/clashrank" className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-100 text-center">
              ClashRank
            </Link>
            {coachDeckId && (
              <Link
                href={`/battle/${coachDeckId}?mode=rival`}
                className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-3 text-sm font-bold text-indigo-100 text-center"
              >
                Study Rival
              </Link>
            )}
            {coachDeckId && (
              <Link
                href={`/battle/${coachDeckId}?mode=boss`}
                className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-3 text-sm font-bold text-indigo-100 text-center"
              >
                Boss Battle
              </Link>
            )}
            <Link href="/pricing" className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3 text-sm font-bold text-indigo-200 text-center">
              Pricing
            </Link>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
            {loadError}
          </div>
        ) : null}

        {(nextAction || trendDeltaPercent !== null) && (
          <div className="grid gap-4 md:grid-cols-2">
            {nextAction && (
              <div className="rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.06] p-5 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">Do this next</p>
                <h2 className="mt-2 text-lg font-bold text-white">{nextAction.title}</h2>
                <p className="mt-2 text-sm text-white/70">{nextAction.message}</p>
                <Link
                  href={nextAction.href}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-500 px-4 py-2.5 text-sm font-bold text-white"
                >
                  {nextAction.cta}
                </Link>
              </div>
            )}

            {trendDeltaPercent !== null && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Improvement trend</p>
                <h2 className="mt-2 text-lg font-bold text-white">Last 5 battles</h2>
                <p
                  className={`mt-3 text-3xl font-black ${
                    trendDeltaPercent > 0
                      ? "text-green-300"
                      : trendDeltaPercent < 0
                        ? "text-amber-300"
                        : "text-white"
                  }`}
                >
                  {trendDeltaPercent > 0 ? "+" : ""}
                  {trendDeltaPercent}%
                </p>
                <p className="mt-2 text-sm text-white/55">
                  {trendDeltaPercent > 0
                    ? "Accuracy is trending up versus your earlier recent matches."
                    : trendDeltaPercent < 0
                      ? "Accuracy dipped versus earlier recent matches. Run a targeted rematch today."
                      : "Accuracy is steady. Keep momentum with one more battle."}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-green-400/25 bg-gradient-to-br from-green-500/[0.08] to-indigo-500/[0.08] p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-green-300">
                Player Progression
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">Level {levelInfo.level} · {rankInfo.label}</h2>
              <p className="mt-1 text-sm text-white/65">
                Keep momentum with daily and weekly study goals.
              </p>
            </div>
            <div className="w-full max-w-[180px] rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">XP in level</p>
              <p className="mt-1 text-base font-black text-green-200">{levelInfo.xpInLevel}/500</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-indigo-300 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, (levelInfo.xpInLevel / 500) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-indigo-400/20 bg-indigo-500/[0.08] px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-100">
                {seasonInfo.seasonNumber === 1 ? "Current Season" : `Season ${seasonInfo.seasonNumber}`}
              </p>
              <p className="text-xs font-bold text-indigo-100">{Math.round(seasonInfo.progressPercent)}%</p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-300 to-green-300 transition-all duration-700"
                style={{ width: `${Math.max(4, seasonInfo.progressPercent)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-indigo-100/80">
              <span
                className={`inline-flex items-center gap-1 font-bold ${
                  (localProgress?.currentStreakDays || 0) > 0 ? "text-amber-300" : "text-indigo-100/80"
                }`}
              >
                <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2c1.2 3-1 4.6-1 7 0 1.4 1 2.5 2.3 2.5 1.4 0 2.2-1 2.2-2.2 2.3 1.7 3.5 4 3.5 6.4C19 19.7 15.9 22 12 22S5 19.7 5 15.7c0-4 3-7.4 7-13.7z" />
                </svg>
                Streak {localProgress?.currentStreakDays || 0}d
              </span>
              <span>•</span>
              <span>Best streak {localProgress?.bestStreakDays || 0}d</span>
              {nextMilestoneXp !== null && (
                <>
                  <span>•</span>
                  <span>{nextMilestoneXp - totalXp} XP to milestone</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/25 px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-wider text-white/45">Daily Goal</p>
              <p className="mt-1 text-sm font-bold text-white">{goalProgress.dailyBattles}/{dailyGoalTarget} battles</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-indigo-300 transition-all duration-500" style={{ width: `${dailyGoalPercent}%` }} />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-wider text-white/45">Weekly Battles</p>
              <p className="mt-1 text-sm font-bold text-white">{goalProgress.weeklyBattles}/{weeklyGoalTarget}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-300 transition-all duration-500" style={{ width: `${weeklyBattlePercent}%` }} />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-wider text-white/45">Weekly Accuracy</p>
              <p className="mt-1 text-sm font-bold text-white">{goalProgress.weeklyAccuracy}% / {weeklyAccuracyTarget}%</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-amber-300 transition-all duration-500" style={{ width: `${weeklyAccuracyPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {combinedBadges.length > 0 ? (
              combinedBadges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-1.5 rounded-full border border-green-300/30 bg-green-500/10 px-2.5 py-1 text-[11px] font-bold text-green-100"
                  style={{ animation: "pulse-enter 320ms ease-brand-bounce" }}
                >
                  <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l2.4 6.6L21 9.3l-5.2 4.3L17.5 20 12 16.4 6.5 20l1.7-6.4L3 9.3l6.6-.7L12 2z" />
                  </svg>
                  {badge}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/40">
                No badges unlocked yet -- win a battle to earn your first
              </span>
            )}
          </div>

          {localProgress && localProgress.historyAccuracies.length > 0 && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                Last 10 Battle Accuracy
              </p>
              <div className="mt-2 flex items-end gap-1">
                {localProgress.historyAccuracies.map((accuracy, index) => (
                  <div key={`${accuracy}-${index}`} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-gradient-to-t from-indigo-500 to-indigo-300"
                      style={{ height: `${Math.max(8, Math.round(accuracy * 0.45))}px` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/[0.08] to-indigo-500/[0.06] p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">
                ClashPath Command Center
              </p>
              <h2 className="mt-2 text-lg font-bold text-white">{clashPathPulse.title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/70">{clashPathPulse.detail}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                Arena Tier
              </p>
              <p className="mt-1 text-base font-black text-indigo-200">{arenaTier}</p>
            </div>
          </div>

          <Link
            href={clashPathPulse.href}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-400 px-4 py-2.5 text-sm font-bold text-white"
          >
            {clashPathPulse.cta}
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

        <div className="rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.06] p-5 backdrop-blur-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">
                Study Plans
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">
                {studyPlans.length > 0 ? "Your active plans" : "No active study plan yet"}
              </h2>
            </div>
            <Link
              href="/diagnostics"
              className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3.5 py-2 text-xs font-bold text-indigo-100"
            >
              Take a Diagnostic
            </Link>
          </div>

          {isLoadingStudyPlans ? (
            <p className="mt-4 text-sm text-white/55">Loading study plans...</p>
          ) : studyPlans.length === 0 ? (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
              Complete a diagnostic or set an upcoming assessment after a battle to get a personalized
              day-by-day plan here.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {studyPlans.map((plan) => {
                const daysRemaining = Math.max(
                  0,
                  Math.ceil(
                    (new Date(`${plan.assessment_date}T00:00:00`).getTime() - renderTimestampMs) /
                      (1000 * 60 * 60 * 24)
                  )
                );

                return (
                  <div key={plan.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{plan.title}</p>
                        <p className="mt-1 text-xs text-white/55">
                          {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining &middot; {plan.weekCompletionPercent}% this week
                          {plan.overdueCount > 0 && (
                            <span className="text-amber-300"> &middot; {plan.overdueCount} overdue</span>
                          )}
                        </p>
                      </div>
                      <Link
                        href={`/study-plans/${plan.id}`}
                        className="rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-400 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Open Plan
                      </Link>
                    </div>

                    {plan.todayTasks.length > 0 && (
                      <div className="mt-2.5 space-y-1">
                        {plan.todayTasks.map((task) => (
                          <p key={task.id} className={`text-xs ${task.completed ? "text-white/35 line-through" : "text-white/70"}`}>
                            Today: {task.title} ({task.estimated_minutes} min)
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.06] p-5 backdrop-blur-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">
                Rival Alerts
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">
                Challenge Notifications
              </h2>
              <p className="mt-1 text-sm text-white/65">
                {unreadNotifications > 0
                  ? `${unreadNotifications} unread alert${unreadNotifications === 1 ? "" : "s"}`
                  : "You are all caught up."}
              </p>
            </div>

            {notifications.length > 0 && (
              <button
                type="button"
                onClick={() => markNotificationsRead()}
                disabled={isMarkingRead || unreadNotifications === 0}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isMarkingRead ? "Updating..." : "Mark All Read"}
              </button>
            )}
          </div>

          {notificationsError && (
            <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {notificationsError}
            </p>
          )}

          {isNotificationsLoading ? (
            <p className="mt-4 text-sm text-white/55">Loading alerts...</p>
          ) : notifications.length === 0 ? (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
              No challenge alerts yet. When someone takes your crown, it will show up here.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border px-4 py-3 ${
                    item.is_read
                      ? "border-white/10 bg-black/20"
                      : "border-indigo-300/35 bg-indigo-500/10"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{item.title}</p>
                      <p className="mt-1 break-words text-xs text-white/70">{item.message}</p>
                      <p className="mt-1 text-[11px] text-white/45">{formatDate(item.created_at)}</p>
                    </div>
                    {!item.is_read && (
                      <span className="rounded-full border border-indigo-300/40 bg-indigo-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                        Unread
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {item.action_href && (
                      <Link
                        href={item.action_href}
                        className="rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-500 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Open Challenge
                      </Link>
                    )}

                    {!item.is_read && (
                      <button
                        type="button"
                        onClick={() => markNotificationsRead([item.id])}
                        disabled={isMarkingRead}
                        className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/85 disabled:opacity-60"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-5 backdrop-blur-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">
                Classroom Beta
              </p>
              <h2 className="mt-1 text-lg font-bold text-white">Teacher Room Launcher</h2>
              <p className="mt-1 text-sm text-white/65">
                Create a room code, share it in class, and run a live deck challenge.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={roomTitleInput}
              onChange={(event) => setRoomTitleInput(event.target.value)}
              placeholder="Room title"
              className="rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder-white/35 outline-none focus:border-amber-300/50"
            />
            <select
              value={roomDeckIdInput}
              onChange={(event) => setRoomDeckIdInput(event.target.value)}
              className="rounded-xl border border-white/15 bg-black/25 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-300/50"
            >
              <option value="">
                {roomModeInput === "tournament" ? "Attach a deck (required)" : "Attach deck later"}
              </option>
              {recentDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.title}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setRoomModeInput("practice")}
              className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-colors ${
                roomModeInput === "practice"
                  ? "border-amber-300/60 bg-amber-500/15 text-amber-100"
                  : "border-white/15 bg-black/20 text-white/60"
              }`}
            >
              Practice Room
            </button>
            <button
              type="button"
              onClick={() => setRoomModeInput("tournament")}
              className={`flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition-colors ${
                roomModeInput === "tournament"
                  ? "border-amber-300/60 bg-amber-500/15 text-amber-100"
                  : "border-white/15 bg-black/20 text-white/60"
              }`}
            >
              Tournament Bracket
            </button>
          </div>
          {roomModeInput === "tournament" && (
            <p className="mt-2 text-xs text-white/50">
              Students register with a room code (login required), then you start the bracket
              once enough have joined. Each match is settled by whoever scores higher on the deck
              after the pairing is made — no live head-to-head needed.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {isCreatingRoom ? "Creating..." : "Create Room"}
            </button>
            <Link
              href="/admin"
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white/90"
            >
              Open Admin Console
            </Link>
          </div>

          {roomInviteStatus && (
            <p className="mt-3 rounded-xl border border-indigo-300/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
              {roomInviteStatus}
            </p>
          )}

          {roomsError && (
            <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {roomsError}
            </p>
          )}

          {roomLimitNotice && (
            <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/12 px-3 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-200">
                Plan Limit Reached
              </p>
              <p className="mt-1 text-xs text-amber-100/90">
                Your {roomLimitNotice.planId} plan allows {roomLimitNotice.roomLimit} live classroom room{roomLimitNotice.roomLimit === 1 ? "" : "s"}. You currently have {roomLimitNotice.currentActiveRooms} active.
              </p>
              {roomLimitNotice.upgradeRequired && (
                <Link
                  href={roomLimitNotice.upgradeHref || "/pricing"}
                  className="mt-2 inline-flex rounded-lg bg-gradient-to-r from-amber-500 to-amber-500 px-3 py-1.5 text-xs font-bold text-white"
                >
                  Upgrade for More Rooms
                </Link>
              )}
            </div>
          )}

          {isRoomsLoading ? (
            <p className="mt-4 text-sm text-white/55">Loading classroom rooms...</p>
          ) : classroomRooms.length === 0 ? (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
              No rooms yet. Create your first classroom room to start live challenges.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {classroomRooms.slice(0, 5).map((room) => (
                <div
                  key={room.id}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{room.title}</p>
                      <p className="mt-1 text-xs text-white/60">
                        Code: <span className="font-black tracking-[0.16em] text-amber-200">{room.share_code || room.room_code}</span>
                      </p>
                      <p className="mt-1 truncate text-xs text-white/45">
                        {room.deck_title || "No deck linked yet"}
                        {room.mode === "tournament" && " · Tournament"}
                      </p>
                    </div>
                    {room.tournament_href ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyRoomInvite(room)}
                          className="rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-100"
                        >
                          Copy Invite
                        </button>
                        <Link
                          href={room.tournament_href}
                          className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-100"
                        >
                          View Bracket
                        </Link>
                      </div>
                    ) : room.launch_href ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyRoomInvite(room)}
                          className="rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-100"
                        >
                          Copy Invite
                        </button>
                        <Link
                          href={room.launch_href}
                          className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-100"
                        >
                          Launch Deck
                        </Link>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => copyRoomInvite(room)}
                        className="rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-100"
                      >
                        Copy Invite
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total decks created" value={totalDecks} isLoading={isLoadingStats} />
          <StatCard label="Battles played" value={battlesPlayed} isLoading={isLoadingStats} />
          <StatCard label="Average accuracy" value={averageAccuracy} suffix="%" isLoading={isLoadingStats} />
          <StatCard label="Decks generated today" value={decksGeneratedToday} isLoading={isLoadingStats} />
          <StatCard
            label="Remaining generations today"
            value={remainingGenerationsToday == null ? "Unlimited" : remainingGenerationsToday}
            isLoading={isLoadingStats}
            hint={planInfo?.label}
          />
          <StatCard
            label="Plan"
            value={profile?.plan || "free_beta"}
            valueClassName="text-xl text-indigo-300"
            hint={planInfo?.description || "Daily generation limits apply based on your plan."}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Recent decks</p>
                <h2 className="text-lg font-bold text-white">Your latest creations</h2>
              </div>
              <Link href="/decks" className="text-sm font-semibold text-indigo-300">View all</Link>
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
              <EmptyState
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                }
                title="No decks yet"
                description="Create your first one to start building your study library."
                actionLabel="Create a deck"
                actionHref="/create"
              />
            ) : (
              <div className="space-y-3">
                {recentDecks.map((deck) => (
                  <Link key={deck.id} href={`/decks/${deck.id}`} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition-colors hover:border-indigo-400/30">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{deck.title}</p>
                      <p className="mt-1 truncate text-xs text-white/45">{deck.course_name}</p>
                    </div>
                    <span className="flex-shrink-0 text-xs text-white/40">{formatDate(deck.created_at)}</span>
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
              <EmptyState
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                }
                title="No battles yet"
                description="Challenge yourself with one of your decks to start earning XP."
                actionLabel="Battle an AI"
                actionHref="/#battle-ai"
              />
            ) : (
              <div className="space-y-3">
                {recentMatches.map((match) => (
                  <div key={match.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{match.player_name}</p>
                        <p className="mt-1 truncate text-xs text-white/45">{match.deck_title || "Study deck"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-bold text-indigo-300">{match.score} pts</p>
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
                <div className="rounded-2xl border-2 border-gradient-to-r from-indigo-500/30 to-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.05] to-indigo-500/[0.05] p-5 backdrop-blur-sm sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">
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
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-400 px-5 py-2.5 text-sm font-bold text-white transition-transform hover:scale-105"
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
                            <span className="rounded-full bg-indigo-500/20 px-2 py-1 text-xs font-bold text-indigo-300">
                              {deck.matchesPlayed} plays
                            </span>
                            <Link
                              href={`/battle/${deck.id}`}
                              className="text-indigo-300 hover:text-indigo-200"
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
                            <p className="mt-0.5 text-xs text-green-300">
                              {deck.averageAccuracy}% avg • Best: {deck.bestScore}%
                            </p>
                          </div>
                          <Link
                            href={`/battle/${deck.id}`}
                            className="ml-2 flex-shrink-0 text-green-300 hover:text-green-200"
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
                              <p className="mt-0.5 text-xs text-indigo-300">
                                {formatDate(deck.lastPlayedDate)}
                              </p>
                            )}
                          </div>
                          <Link
                            href={`/battle/${deck.id}`}
                            className="ml-2 flex-shrink-0 text-indigo-300 hover:text-indigo-200"
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

      <VyraCoach
        deckId={coachDeckId}
        deckTitle={coachDeckId ? "Recommended deck context" : "Dashboard study context"}
        courseName="StudyClash Dashboard"
        playerName={profile?.display_name || user?.email || "Student"}
        weakTopics={coachWeakTopics}
        missedQuestions={[]}
        battleScore={undefined}
        accuracyPercent={averageAccuracy}
        previousRematches={Math.max(0, battlesPlayed - 1)}
        masteryProgress={coachMasteryProgress}
        recentBattleHistory={recentMatches.slice(0, 6).map((match) => ({
          score: match.score,
          accuracyPercent:
            match.total_questions > 0
              ? Math.round((match.correct_answers / match.total_questions) * 100)
              : undefined,
          deckTitle: match.deck_title,
          createdAt: match.created_at,
        }))}
        contextLabel="Dashboard"
      />
    </Background>
  );
}
