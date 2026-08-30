"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { useLoadingTimeout } from "@/lib/useLoadingTimeout";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// Past diagnostic results.
//
// Rebuilt on the design system alongside /diagnostics, which links here as
// "Past results". Two things beyond the styling:
//
// - The tier badges used a fifth colour language (green/indigo/amber/red)
//   for the same words the rest of the app already had chips for. They now
//   use the shared four-tone chip scale.
// - Auth is handled by useRequireAuth rather than a hand-rolled effect, so a
//   signed-out visitor keeps their destination through the login bounce like
//   they do everywhere else.

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
  skills: {
    skill: string;
    domain: string;
    masteryScore: number;
    isEstimate: boolean;
    attemptsCount: number;
    lastAttemptAt: string | null;
    masteryTier: string;
    masteryTierLabel: string;
  }[];
};

type HistoryPayload = {
  attempts: AttemptHistoryRow[];
  masteryByExam: ExamMastery[];
};

const MODE_LABELS: Record<AttemptHistoryRow["mode"], string> = {
  quick: "Quick",
  full: "Full length",
  weak_area: "Weak-area retest",
};

/** The same four tones the mastery map and the rest of the app use. */
function tierChipClass(tier: string): string {
  if (tier === "mastered" || tier === "strong") return "chip chip-ok";
  if (tier === "developing") return "chip chip-warn";
  return "chip chip-bad";
}

function tierColor(tier: string | null): string {
  if (tier === "mastered" || tier === "strong") return "var(--ok)";
  if (tier === "developing") return "var(--warn)";
  if (tier === "needs_review") return "var(--bad)";
  return "var(--text-1)";
}

function Skeletons() {
  return (
    <div className="app-page">
      <div className="skeleton h-9 w-52" />
      <div className="skeleton mt-8 h-[220px] w-full" />
      <div className="skeleton mt-6 h-[160px] w-full" />
    </div>
  );
}

export default function DiagnosticHistoryPage() {
  const { isReady } = useRequireAuth();
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadTimedOut = useLoadingTimeout(isLoading);

  const fetchHistory = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    authFetch("/api/diagnostics/history", { method: "GET" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          setLoadError(json?.error || "We could not load your history.");
          return;
        }
        setData(json);
      })
      .catch((err) =>
        setLoadError(
          err instanceof Error ? err.message : "We could not load your history."
        )
      )
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!isReady) return;
    void trackEvent("page_view", { page: "diagnostic_history" });
    fetchHistory();
  }, [isReady, fetchHistory]);

  if (!isReady || (isLoading && !data && !loadError && !loadTimedOut)) {
    return <Skeletons />;
  }

  if ((loadError || loadTimedOut) && !data) {
    return (
      <div className="app-page">
        <h1 className="t-page">Past results</h1>
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            {loadError || "This is taking longer than it should."}
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            This is usually a connection blip rather than anything you did.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <button type="button" onClick={fetchHistory} className="btn btn-primary">
              Try again
            </button>
            <Link href="/diagnostics" className="btn btn-secondary">
              Back to diagnostics
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasNothing =
    data.attempts.length === 0 && data.masteryByExam.length === 0;

  return (
    <div className="app-page">
      <Link
        href="/diagnostics"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium"
        style={{ color: "var(--text-3)" }}
      >
        <span aria-hidden="true">←</span> Diagnostics
      </Link>

      <h1 className="t-page mt-4">Past results</h1>
      <p className="t-body mt-2 max-w-2xl">
        Every diagnostic you have finished, and how your skills have moved since.
      </p>

      {hasNothing ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Nothing here yet
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Take a diagnostic and this fills in with your score, your weakest
            skills, and how they change each time you retake it.
          </p>
          <Link href="/diagnostics" className="btn btn-primary mt-6">
            Take a diagnostic
          </Link>
        </div>
      ) : (
        <>
          {data.masteryByExam.length > 0 && (
            <section className="mt-10">
              <h2 className="t-section">Skill by skill</h2>
              <div className="mt-3 flex flex-col gap-4">
                {data.masteryByExam.map((exam) => (
                  <div key={exam.examSlug} className="card p-5">
                    <p
                      className="text-[16px] font-medium"
                      style={{ color: "var(--text-1)" }}
                    >
                      {exam.examName}
                    </p>
                    <ul className="mt-4 flex flex-col gap-3">
                      {exam.skills.slice(0, 12).map((s) => (
                        <li key={s.skill}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span
                              className="min-w-0 truncate text-[13.5px]"
                              style={{ color: "var(--text-2)" }}
                            >
                              {s.skill}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span
                                className="text-[12px] font-medium tabular-nums"
                                style={{ color: "var(--text-2)" }}
                              >
                                {s.masteryScore}%{s.isEstimate ? "*" : ""}
                              </span>
                              <span className={tierChipClass(s.masteryTier)}>
                                {s.masteryTierLabel}
                              </span>
                            </span>
                          </div>
                          <div className="meter mt-1.5">
                            <span
                              style={{
                                width: `${Math.min(100, Math.max(2, s.masteryScore))}%`,
                                background: tierColor(s.masteryTier),
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                    {exam.skills.some((s) => s.isEstimate) && (
                      <p className="t-meta mt-3">
                        * Early estimate — fewer than three questions answered on
                        that skill so far.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mt-10">
            <h2 className="t-section">Attempts</h2>
            {data.attempts.length === 0 ? (
              <div className="card mt-3 px-6 py-10 text-center">
                <p className="t-body">
                  No finished diagnostics yet.{" "}
                  <Link
                    href="/diagnostics"
                    className="underline underline-offset-2"
                    style={{ color: "var(--brand-text)" }}
                  >
                    Take one
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <ul
                className="card mt-3 divide-y overflow-hidden"
                style={{ borderColor: "var(--line)" }}
              >
                {data.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <Link
                      href={`/diagnostics/results/${attempt.id}`}
                      className="flex flex-wrap items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--panel-raised)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[15px] font-medium"
                          style={{ color: "var(--text-1)" }}
                        >
                          {attempt.examName}
                        </p>
                        <p className="t-meta truncate">
                          {MODE_LABELS[attempt.mode]} ·{" "}
                          {new Date(attempt.completedAt).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-5 text-right">
                        {attempt.estimatedScoreLow !== null && (
                          <div>
                            <p
                              className="text-[15px] font-medium tabular-nums"
                              style={{ color: "var(--text-1)" }}
                            >
                              {attempt.estimatedScoreLow}–
                              {attempt.estimatedScoreHigh}
                            </p>
                            <p className="t-meta">score</p>
                          </div>
                        )}
                        <div>
                          <p
                            className="text-[15px] font-medium tabular-nums"
                            style={{ color: "var(--text-1)" }}
                          >
                            {attempt.overallAccuracy}%
                          </p>
                          <p className="t-meta">correct</p>
                        </div>
                        {attempt.readinessTier && (
                          <div>
                            <p
                              className="text-[15px] font-medium tabular-nums"
                              style={{ color: tierColor(attempt.readinessTier) }}
                            >
                              {attempt.readinessScore}
                            </p>
                            <p className="t-meta">ready</p>
                          </div>
                        )}
                        <ArrowRightIcon className="h-4 w-4 opacity-40" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
