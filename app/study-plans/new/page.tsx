"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Reads "?diagnosticAttemptId=" directly from window.location instead of
// next/navigation's useSearchParams(), which requires wrapping the page in
// a Suspense boundary or the production build fails to prerender this route
// -- same convention already used in app/login/page.tsx for its "?redirect="
// param.
function getDiagnosticAttemptId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("diagnosticAttemptId");
}

export default function NewStudyPlanPage() {
  const router = useRouter();
  const [diagnosticAttemptId] = useState(() => getDiagnosticAttemptId());

  const [testDate, setTestDate] = useState("");
  const [targetScore, setTargetScore] = useState("");
  const [minutesWeekday, setMinutesWeekday] = useState(30);
  const [minutesWeekend, setMinutesWeekend] = useState(45);
  const [unavailableWeekdays, setUnavailableWeekdays] = useState<number[]>([]);
  const [intensity, setIntensity] = useState<"light" | "balanced" | "intensive">("balanced");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetake, setIsRetake] = useState(false);

  const toggleWeekday = (idx: number) => {
    setUnavailableWeekdays((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]));
  };

  // If this exam already has an active plan, pre-fill from it instead of
  // leaving the form blank -- a retake should default to "same schedule,
  // updated results," not force re-entering everything or risk silently
  // changing the plan's cadence because a field was left at its default.
  useEffect(() => {
    if (!diagnosticAttemptId) return;

    supabase
      .from("diagnostic_attempts")
      .select("exam:exam_definitions(slug)")
      .eq("id", diagnosticAttemptId)
      .maybeSingle()
      .then(async ({ data: attempt }) => {
        const examSlug = (attempt?.exam as unknown as { slug: string } | null)?.slug;
        if (!examSlug) return;

        const { data: existingPlan } = await supabase
          .from("study_plans")
          .select("assessment_date, target_score, minutes_per_day, available_days")
          .eq("exam_type", examSlug)
          .eq("source_type", "diagnostic")
          .eq("status", "active")
          .maybeSingle();

        if (!existingPlan) return;

        setIsRetake(true);
        setTestDate(existingPlan.assessment_date);
        if (existingPlan.target_score) setTargetScore(existingPlan.target_score);
        if (existingPlan.minutes_per_day) {
          setMinutesWeekday(existingPlan.minutes_per_day);
          setMinutesWeekend(existingPlan.minutes_per_day);
        }
        const availableDays = (existingPlan.available_days as string[]) || WEEKDAY_NAMES;
        setUnavailableWeekdays(
          WEEKDAY_NAMES.map((_, idx) => idx).filter((idx) => !availableDays.includes(WEEKDAY_NAMES[idx]))
        );
      });
  }, [diagnosticAttemptId]);

  const handleSubmit = async () => {
    if (!diagnosticAttemptId) {
      setError("Missing diagnostic attempt. Please start from your diagnostic results page.");
      return;
    }
    if (!testDate) {
      setError("Please enter your test date.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authFetch("/api/study-plans/generate", {
        method: "POST",
        body: JSON.stringify({
          diagnosticAttemptId,
          testDate,
          targetScore: targetScore || undefined,
          minutesPerWeekday: minutesWeekday,
          minutesPerWeekend: minutesWeekend,
          unavailableWeekdays,
          intensity,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not build your study plan.");
        setIsSubmitting(false);
        return;
      }

      void trackEvent("study_plan_created", {
        planId: json.planId,
        source: "diagnostic",
        updated: !!json.updated,
      });
      router.push(`/study-plans/${json.planId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build your study plan.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[#05050a] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          <span className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-transparent">
            {isRetake ? "Update your study plan" : "Build your study plan"}
          </span>
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {isRetake
            ? "Pre-filled from your existing plan -- edit anything that's changed, then continue. Anything you've already completed stays exactly as it is."
            : "A few questions so the plan fits your actual schedule, not a generic template."}
        </p>

        <Card className="mt-6 space-y-4" padding="md">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-white/40">Test date</label>
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-white/40">
              Target score (optional)
            </label>
            <input
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              placeholder="e.g. 1350"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white placeholder-white/35"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-white/40">Minutes / school day</label>
              <input
                type="number"
                min={10}
                max={240}
                value={minutesWeekday}
                onChange={(e) => setMinutesWeekday(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-white/40">Minutes / weekend day</label>
              <input
                type="number"
                min={10}
                max={240}
                value={minutesWeekend}
                onChange={(e) => setMinutesWeekend(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-white/40">
              Days you can&apos;t study
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAY_NAMES.map((name, idx) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleWeekday(idx)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                    unavailableWeekdays.includes(idx)
                      ? "border-red-400/40 bg-red-500/10 text-red-300"
                      : "border-white/15 bg-white/5 text-white/70"
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-white/40">Plan intensity</label>
            <div className="mt-2 flex gap-2">
              {(["light", "balanced", "intensive"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setIntensity(option)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold capitalize ${
                    intensity === option
                      ? "border-cyan-300/60 bg-cyan-500/15 text-cyan-100"
                      : "border-white/15 bg-white/5 text-white/60"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <Button variant="primary" fullWidth isLoading={isSubmitting} onClick={handleSubmit}>
            {isRetake ? "Update my plan" : "Build my plan"}
          </Button>
        </Card>
      </div>
    </main>
  );
}
