"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { localDateKey, type QuestProgress } from "@/lib/progression";
import type { Rank } from "@/lib/ranking";
import type { LevelProgress } from "@/lib/progression";

// The student's own progression: level, streak, today's quests, rank.
//
// Deliberately separate from useStudy (the study snapshot). They answer
// different questions -- "what should I study" versus "how am I doing" --
// have different refresh triggers, and a slow or failed progression read
// must never stop Home from telling someone what to study.

export type SubjectRating = {
  subject: string;
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
  winRate: number | null;
  rank: Rank;
  rankPercent: number;
};

export type ProgressSnapshot = {
  level: LevelProgress;
  xp: number;
  streak: {
    current: number;
    longest: number;
    lastActiveOn: string | null;
    freezes: number;
  };
  quests: QuestProgress[];
  ratings: SubjectRating[];
  season: { id: string; name: string; startedAt: string; endsAt: string } | null;
  achievements: Array<{
    achievement_key: string;
    progress: number;
    earned_at: string | null;
  }>;
};

export function useProgress(options: { hasReviewsDue?: boolean; enabled?: boolean } = {}) {
  const { hasReviewsDue = false, enabled = true } = options;
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const params = new URLSearchParams({
        date: localDateKey(new Date()),
        reviewsDue: hasReviewsDue ? "1" : "0",
      });
      const response = await authFetch(`/api/progress?${params.toString()}`);
      if (!response.ok) throw new Error("unavailable");
      setProgress((await response.json()) as ProgressSnapshot);
    } catch {
      // Progression is additive. If it cannot load, the rest of the screen
      // is still completely usable, so this stays null rather than
      // surfacing an error the student can do nothing about.
      setProgress(null);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, hasReviewsDue]);

  useEffect(() => {
    void load();
  }, [load]);

  return { progress, isLoading, refresh: load };
}
