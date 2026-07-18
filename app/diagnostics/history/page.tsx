"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { trackEvent } from "@/lib/trackEvent";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { useLoadingTimeout } from "@/lib/useLoadingTimeout";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type AttemptHistoryRow = {
  id: string;
  mode: "quick" | "full" | "weak_area";
  completedAt: string;
  examName: string;
  examSlug: string;
  overallAccuracy: number | null;
  readinessScore: number | null;
  readinessTier: "needs_review" | "developing" | "strong" | "mastered" | null;
  estimatedScoreLow: number | null;
  estimatedScoreHigh: number | null;
};

type ExamMastery = {
  examName: string;
  examSlug: string;
  skills: { skill: string; domain: string; masteryScore: number; isEstimate: boolean; attemptsCount: number; lastAttemptAt: string | null }[];
};

type HistoryPayload = {
  attempts: AttemptHistoryRow[];
  masteryByExam: ExamMastery[];
};

const MODE_LABELS: Record<AttemptHistoryRow["mode"], string> = {
  quick: "Quick",
  full: "Full",
  weak_area: "Weak-Area Retest",
};

const READINESS_TONE: Record<string, string> = {
  needs_review: "text-red-300",
  developing: "text-amber-300",
  strong: "text-green-300",
  mastered: "text-emerald-300",
};

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

export default function DiagnosticHistoryPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadTimedOut = useLoadingTimeout(isLoading);

  const fetchHistory = () => {
    setIsLoading(true);
    setLoadError(null);
    authFetch("/api/diagnostics/history", { method: "GET" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setLoadError(json.error || "Could not load your history.");
          return;
        }
        setData(json);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load your history."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isLoggedIn) {
      router.push("/login?redirect=/diagnostics/history");
      return;
    }
    void trackEvent("page_view", { page: "diagnostic_history" });
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isLoggedIn]);

  if (isAuthLoading || (isLoading && !data)) {
    return (
      <Background>
        {loadError ? (
          <p className="text-sm text-red-300">{loadError}</p>
        ) : loadTimedOut ? (
          <div className="text-center">
            <p className="text-sm text-white/50">This is taking longer than expected.</p>
            <Button onClick={fetchHistory} className="mt-3">Retry</Button>
          </div>
        ) : (
          <p className="text-sm text-white/50">Loading your history...</p>
        )}
      </Background>
    );
  }

  if (loadError && !data) {
    return (
      <Background>
        <p className="text-sm text-red-300">{loadError}</p>
        <Button onClick={fetchHistory} className="mt-3 w-fit">Retry</Button>
      </Background>
    );
  }

  if (!data) return null;

  return (
    <Background>
      <Link href="/diagnostics" className="w-fit text-sm font-semibold text-indigo-300">
        &larr; Back to diagnostics
      </Link>

      <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
        <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
          Your diagnostic history
        </span>
      </h1>
      <p className="mt-2 text-sm text-white/60">
        Every completed diagnostic and retest, plus how your mastery has moved over time.
      </p>

      {data.masteryByExam.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-white/50">Mastery by skill</p>
          <div className="mt-3 flex flex-col gap-4">
            {data.masteryByExam.map((exam) => (
              <Card key={exam.examSlug} padding="md">
                <p className="text-sm font-bold text-white">{exam.examName}</p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {exam.skills.slice(0, 12).map((s) => (
                    <div key={s.skill} className="flex items-center gap-3">
                      <span className="w-40 flex-shrink-0 truncate text-xs text-white/70">{s.skill}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-400"
                          style={{ width: `${s.masteryScore}%` }}
                        />
                      </div>
                      <span className="w-14 flex-shrink-0 text-right text-xs font-bold text-white/60">
                        {s.masteryScore}%{s.isEstimate ? "*" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                {exam.skills.some((s) => s.isEstimate) && (
                  <p className="mt-2 text-[11px] text-white/35">
                    * Early estimate -- fewer than 3 questions answered on this skill so far.
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-white/50">Attempts</p>
        {data.attempts.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No completed diagnostics yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {data.attempts.map((attempt) => (
              <Link key={attempt.id} href={`/diagnostics/results/${attempt.id}`}>
                <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:border-indigo-300/40">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {attempt.examName} &middot; {MODE_LABELS[attempt.mode]}
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40">
                      {new Date(attempt.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {attempt.estimatedScoreLow !== null && (
                      <div>
                        <p className="text-sm font-bold text-white">
                          {attempt.estimatedScoreLow}&ndash;{attempt.estimatedScoreHigh}
                        </p>
                        <p className="text-[10px] text-white/40">score range</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">{attempt.overallAccuracy}%</p>
                      <p className="text-[10px] text-white/40">accuracy</p>
                    </div>
                    {attempt.readinessTier && (
                      <div>
                        <p className={`text-sm font-bold ${READINESS_TONE[attempt.readinessTier] || "text-white"}`}>
                          {attempt.readinessScore}
                        </p>
                        <p className="text-[10px] text-white/40">readiness</p>
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Background>
  );
}
