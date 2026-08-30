"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { useAuth } from "@/lib/useAuth";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ArrowRightIcon } from "@/app/components/app/Icons";

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Build (or update) a study plan.
//
// A plan is generated FROM a diagnostic -- the schedule is built out of the
// skills that diagnostic found you were weak in, so there is nothing to plan
// against without one. Practice links here as "Plan for a test date", though,
// which meant a student could arrive with no attempt id, fill in the whole
// form, press the button, and only then be told "Missing diagnostic attempt.
// Please start from your diagnostic results page."
//
// So the page now checks first and says so up front, with the one action that
// actually unlocks it -- and surfaces an existing plan if there is one, since
// "I already have a plan" is the other reason someone lands here.

/** Reads "?diagnosticAttemptId=" from the URL.
 *  window.location rather than useSearchParams(), which would require a
 *  Suspense boundary around this page -- same convention as app/login. */
function getDiagnosticAttemptId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("diagnosticAttemptId");
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="t-section block">{label}</label>
      {hint && <p className="t-meta mt-0.5">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function NewStudyPlanPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isReady } = useRequireAuth();
  const [diagnosticAttemptId] = useState(() => getDiagnosticAttemptId());

  const [testDate, setTestDate] = useState("");
  const [targetScore, setTargetScore] = useState("");
  const [minutesWeekday, setMinutesWeekday] = useState(30);
  const [minutesWeekend, setMinutesWeekend] = useState(45);
  const [unavailableWeekdays, setUnavailableWeekdays] = useState<number[]>([]);
  const [intensity, setIntensity] = useState<"light" | "balanced" | "intensive">(
    "balanced"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetake, setIsRetake] = useState(false);

  // Only consulted when there is no attempt id, to answer "you already have
  // one, here it is" rather than a bare dead end.
  const [existingPlanId, setExistingPlanId] = useState<string | null>(null);
  const [isCheckingPlans, setIsCheckingPlans] = useState(!getDiagnosticAttemptId());

  const toggleWeekday = (idx: number) => {
    setUnavailableWeekdays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    );
  };

  useEffect(() => {
    if (diagnosticAttemptId || !isReady || !user) return;

    let cancelled = false;
    supabase
      .from("study_plans")
      .select("id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setExistingPlanId(data?.id ?? null);
        setIsCheckingPlans(false);
      });

    return () => {
      cancelled = true;
    };
  }, [diagnosticAttemptId, isReady, user]);

  // If this exam already has an active plan, pre-fill from it instead of
  // leaving the form blank -- a retake should default to "same schedule,
  // updated results", not force re-entering everything or risk silently
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
        const availableDays =
          (existingPlan.available_days as string[]) || WEEKDAY_NAMES;
        setUnavailableWeekdays(
          WEEKDAY_NAMES.map((_, idx) => idx).filter(
            (idx) => !availableDays.includes(WEEKDAY_NAMES[idx])
          )
        );
      });
  }, [diagnosticAttemptId]);

  const handleSubmit = useCallback(async () => {
    if (!diagnosticAttemptId) return;
    if (!testDate) {
      setError("Add your test date so the plan knows how long it has.");
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

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error || "We could not build your study plan. Try again.");
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
      setError(
        err instanceof Error
          ? err.message
          : "We could not build your study plan. Try again."
      );
      setIsSubmitting(false);
    }
  }, [
    diagnosticAttemptId,
    testDate,
    targetScore,
    minutesWeekday,
    minutesWeekend,
    unavailableWeekdays,
    intensity,
    router,
  ]);

  if (!isReady) {
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton mt-8 h-[420px] w-full" />
      </div>
    );
  }

  /* ---- Arrived without a diagnostic: say so, and offer the way in ---- */
  if (!diagnosticAttemptId) {
    return (
      <div className="app-page" style={{ maxWidth: "40rem" }}>
        <h1 className="t-page">Build a study plan</h1>
        <p className="t-body mt-2">
          A plan is built from a diagnostic — it schedules the skills the test
          found you were weakest in. So the diagnostic comes first.
        </p>

        {isCheckingPlans ? (
          <div className="skeleton mt-8 h-[140px] w-full" />
        ) : (
          <>
            <div
              className="card mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
              style={{
                borderColor: "var(--brand-line)",
                background: "var(--brand-soft)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-[17px] font-medium"
                  style={{ color: "var(--text-1)" }}
                >
                  Take a diagnostic
                </p>
                <p className="t-meta mt-1">
                  About 30 minutes. You get the plan straight afterwards.
                </p>
              </div>
              <Link href="/diagnostics" className="btn btn-primary btn-lg shrink-0">
                Start
                <ArrowRightIcon className="h-[18px] w-[18px]" />
              </Link>
            </div>

            {existingPlanId && (
              <section className="mt-8">
                <h2 className="t-section">You already have one</h2>
                <Link
                  href={`/study-plans/${existingPlanId}`}
                  className="card-link mt-3 flex items-center gap-4 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[15px] font-medium"
                      style={{ color: "var(--text-1)" }}
                    >
                      Your current study plan
                    </p>
                    <p className="t-meta mt-0.5">Pick up where you left off</p>
                  </div>
                  <ArrowRightIcon className="h-[18px] w-[18px] shrink-0 opacity-50" />
                </Link>
              </section>
            )}

            <p className="t-meta mt-8">
              Not ready for a full diagnostic?{" "}
              <Link
                href="/practice"
                className="underline underline-offset-2"
                style={{ color: "var(--brand-text)" }}
              >
                Practice picks what to work on for you
              </Link>
              , no setup needed.
            </p>
          </>
        )}
      </div>
    );
  }

  /* ---- The form ---- */
  return (
    <div className="app-page" style={{ maxWidth: "40rem" }}>
      <h1 className="t-page">
        {isRetake ? "Update your study plan" : "Build your study plan"}
      </h1>
      <p className="t-body mt-2">
        {isRetake
          ? "Filled in from your current plan. Change anything that has moved — everything you have already finished stays done."
          : "A few questions, so the plan fits your actual week rather than a template."}
      </p>

      <form
        className="card mt-6 flex flex-col gap-5 p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Field label="Test date">
          <input
            type="date"
            required
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            className="field"
          />
        </Field>

        <Field label="Target score" hint="Optional.">
          <input
            value={targetScore}
            onChange={(e) => setTargetScore(e.target.value)}
            placeholder="e.g. 1520"
            className="field"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minutes on a school day">
            <input
              type="number"
              min={10}
              max={240}
              value={minutesWeekday}
              onChange={(e) => setMinutesWeekday(Number(e.target.value))}
              className="field"
            />
          </Field>
          <Field label="Minutes at the weekend">
            <input
              type="number"
              min={10}
              max={240}
              value={minutesWeekend}
              onChange={(e) => setMinutesWeekend(Number(e.target.value))}
              className="field"
            />
          </Field>
        </div>

        <Field label="Days you can't study" hint="Tap any day to skip it.">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_NAMES.map((name, idx) => {
              const off = unavailableWeekdays.includes(idx);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleWeekday(idx)}
                  aria-pressed={off}
                  className="rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors"
                  style={{
                    borderColor: off ? "var(--line-strong)" : "var(--line)",
                    background: off ? "var(--panel-hover)" : "var(--panel-raised)",
                    color: off ? "var(--text-4)" : "var(--text-1)",
                    textDecoration: off ? "line-through" : "none",
                  }}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="How hard should it push?">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["light", "Light"],
                ["balanced", "Balanced"],
                ["intensive", "Intensive"],
              ] as const
            ).map(([value, label]) => {
              const active = intensity === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIntensity(value)}
                  aria-pressed={active}
                  className="rounded-lg border px-3 py-2.5 text-[14px] font-medium transition-colors"
                  style={{
                    borderColor: active ? "var(--brand-line)" : "var(--line)",
                    background: active ? "var(--brand-soft)" : "var(--panel-raised)",
                    color: active ? "var(--text-1)" : "var(--text-2)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>

        {error && (
          <p
            role="alert"
            className="text-[13px]"
            style={{ color: "var(--bad)" }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary btn-lg w-full"
        >
          {isSubmitting
            ? "Building your plan…"
            : isRetake
              ? "Update my plan"
              : "Build my plan"}
        </button>
      </form>
    </div>
  );
}
