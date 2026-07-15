"use client";

import { useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";

type AssessmentType =
  | "quiz"
  | "unit_test"
  | "midterm"
  | "final_exam"
  | "assignment"
  | "presentation"
  | "standardized_test";

const ASSESSMENT_OPTIONS: { value: AssessmentType; label: string }[] = [
  { value: "quiz", label: "Quiz" },
  { value: "unit_test", label: "Unit Test" },
  { value: "midterm", label: "Midterm" },
  { value: "final_exam", label: "Final Exam" },
  { value: "assignment", label: "Assignment" },
  { value: "presentation", label: "Presentation" },
  { value: "standardized_test", label: "Standardized Test" },
];

type Props = {
  matchId: string;
  deckTitle: string;
};

// Shown once, inline, after a normal StudyClash battle's results -- not a
// blocking auto-popup (the spec allows either "a section or modal"; a
// dismissible inline card is the less intrusive reading of that). Only
// meaningful for logged-in users, since a study plan needs a user_id.
export default function UpcomingAssessmentPrompt({ matchId, deckTitle }: Props) {
  const [step, setStep] = useState<"select" | "details" | "done" | "dismissed">("select");
  const [assessmentType, setAssessmentType] = useState<AssessmentType | null>(null);
  const [assessmentName, setAssessmentName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [goal, setGoal] = useState("");
  const [minutesPerDay, setMinutesPerDay] = useState(25);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextBestAction, setNextBestAction] = useState<{ title: string; description: string } | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  const handleSelect = (type: AssessmentType) => {
    setAssessmentType(type);
    setStep("details");
    void trackEvent("upcoming_assessment_added", { matchId, assessmentType: type });
  };

  const handleNotNow = () => {
    setStep("dismissed");
  };

  const handleSubmit = async () => {
    if (!assessmentType || !dueDate) {
      setError("Please pick a due date.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authFetch("/api/study-plans/generate-short-term", {
        method: "POST",
        body: JSON.stringify({
          matchId,
          assessmentType,
          assessmentName: assessmentName || undefined,
          dueDate,
          goal: goal || undefined,
          minutesPerDay,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not build a plan right now.");
        setIsSubmitting(false);
        return;
      }

      void trackEvent("study_plan_created", { planId: json.planId, source: "battle_assessment" });
      setPlanId(json.planId);
      setNextBestAction(json.nextBestAction || null);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build a plan right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "dismissed") return null;

  return (
    <div className="mt-6 rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-5 backdrop-blur-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300">Coming up</p>

      {step === "select" && (
        <>
          <h3 className="mt-2 text-lg font-bold text-white">Are you preparing for something?</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {ASSESSMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-bold text-white/85 hover:border-violet-300/40 hover:bg-violet-500/10"
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleNotNow}
              className="rounded-xl border border-transparent px-3.5 py-2 text-sm font-semibold text-white/40 hover:text-white/60"
            >
              Not now
            </button>
          </div>
        </>
      )}

      {step === "details" && assessmentType && (
        <>
          <h3 className="mt-2 text-lg font-bold text-white">
            {ASSESSMENT_OPTIONS.find((o) => o.value === assessmentType)?.label} details
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Name (optional)"
              value={assessmentName}
              onChange={(e) => setAssessmentName(e.target.value)}
              className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white placeholder-white/35"
            />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white"
            />
            <input
              placeholder="Goal (optional, e.g. B+ or higher)"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white placeholder-white/35"
            />
            <input
              type="number"
              min={10}
              max={180}
              value={minutesPerDay}
              onChange={(e) => setMinutesPerDay(Number(e.target.value))}
              className="rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white"
              placeholder="Minutes available per day"
            />
          </div>

          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

          <div className="mt-4 flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleNotNow}>
              Not now
            </Button>
            <Button variant="primary" size="sm" isLoading={isSubmitting} onClick={handleSubmit}>
              Build my plan
            </Button>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <h3 className="mt-2 text-lg font-bold text-white">Your plan is ready</h3>
          {nextBestAction && (
            <div className="mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Your Next Best Action</p>
              <p className="mt-1 text-sm font-semibold text-white">{nextBestAction.title}</p>
              <p className="mt-1 text-xs text-white/60">{nextBestAction.description}</p>
            </div>
          )}
          {planId && (
            <Link
              href={`/study-plans/${planId}`}
              className="mt-4 inline-flex rounded-xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2.5 text-sm font-bold text-white"
            >
              Open Study Plan
            </Link>
          )}
          <p className="mt-2 text-xs text-white/40">Built from &quot;{deckTitle}&quot; and your recent answers.</p>
        </>
      )}
    </div>
  );
}
