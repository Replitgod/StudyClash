"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";

type ResponseReviewRow = {
  question_id: string;
  selected_answer: string | null;
  is_correct: boolean | null;
  response_time_seconds: number | null;
  flagged: boolean;
  section: string;
  module: number;
  question: {
    domain: string;
    skill: string;
    difficulty: string;
    question_type: string;
    stimulus: string | null;
    question_text: string;
    answer_choices: { id: string; text: string }[] | null;
    correct_answer: string;
    explanation: string;
  };
};

type ResultsPayload = {
  overall_accuracy: number;
  section_results: Record<string, { correct: number; total: number; accuracy: number }>;
  domain_results: Record<string, { correct: number; total: number; accuracy: number }>;
  skill_results: Record<string, { domain: string; correct: number; total: number; accuracy: number }>;
  pacing_results: { averageSecondsPerQuestion: number; guessedTooQuickly: string[]; spentTooLong: string[] };
  strongest_skills: { skill: string; accuracy: number; sampleSize?: number; lowConfidence?: boolean }[];
  weakest_skills: { skill: string; accuracy: number; sampleSize?: number; lowConfidence?: boolean }[];
  estimated_score_low: number;
  estimated_score_high: number;
};

type ReviewPayload = {
  attempt: {
    id: string;
    exam_id: string;
    mode: "quick" | "full";
    completed_at: string;
    exam: { name: string; slug: string; disclaimer: string };
  };
  results: ResultsPayload;
  responses: ResponseReviewRow[];
};

type Resource = {
  title: string;
  source: string;
  url: string;
  whyChosen: string;
  trustTier: "official" | "reputable" | "community";
};

const SECTION_LABELS: Record<string, string> = {
  reading_writing: "Reading and Writing",
  math: "Math",
};

function suggestedRetakeDate(completedAtIso: string, mode: "quick" | "full"): string {
  const completed = new Date(completedAtIso);
  const daysToAdd = mode === "quick" ? 21 : 35;
  const retake = new Date(completed.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return retake.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function DiagnosticResultsPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = String(params.attemptId || "");
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [data, setData] = useState<ReviewPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [showFullReview, setShowFullReview] = useState(false);
  const [hasActivePlan, setHasActivePlan] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      router.push(`/login?redirect=/diagnostics/results/${attemptId}`);
      return;
    }
    if (!isLoggedIn) return;

    authFetch(`/api/diagnostics/attempt/${attemptId}/review`, { method: "GET" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setError(json.error || "Could not load your results.");
          return;
        }
        setData(json);
        void trackEvent("diagnostic_results_viewed", { attemptId, mode: json.attempt.mode });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your results."))
      .finally(() => setIsLoading(false));
  }, [attemptId, isLoggedIn, isAuthLoading, router]);

  useEffect(() => {
    if (!data || data.results.weakest_skills.length === 0) return;

    authFetch("/api/find-resources", {
      method: "POST",
      body: JSON.stringify({ weakTopics: data.results.weakest_skills.map((s) => s.skill) }),
    })
      .then((res) => res.json())
      .then((json) => setResources(json.resources || []))
      .catch(() => setResources([]));
  }, [data]);

  // Lets the CTA below say "Update" instead of "Create" when a plan for
  // this exam already exists -- generating again after a retake now
  // updates that plan in place (see /api/study-plans/generate), so the
  // button should say what it's actually about to do.
  useEffect(() => {
    if (!data) return;

    supabase
      .from("study_plans")
      .select("id")
      .eq("exam_type", data.attempt.exam.slug)
      .eq("source_type", "diagnostic")
      .eq("status", "active")
      .maybeSingle()
      .then(({ data: existing }) => setHasActivePlan(!!existing));
  }, [data]);

  if (isLoading || isAuthLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#05050a] text-white">
        <p className="text-sm text-white/50">Loading your results...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#05050a] px-4 text-center text-white">
        <p className="text-sm text-red-300">{error || "Results not found."}</p>
        <Link href="/diagnostics" className="text-sm font-semibold text-cyan-300">
          &larr; Back to diagnostics
        </Link>
      </main>
    );
  }

  const { results, responses, attempt } = data;

  return (
    <main className="min-h-dvh bg-[#05050a] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link href="/diagnostics" className="text-sm font-semibold text-cyan-300">
          &larr; Back to diagnostics
        </Link>

        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          <span className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-transparent">
            {attempt.exam.name} Results
          </span>
        </h1>

        <Card tone="fuchsia" className="mt-6" padding="lg">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-fuchsia-300">
            StudyClash diagnostic estimate
          </p>
          <p className="mt-2 text-4xl font-black text-white sm:text-5xl">
            {results.estimated_score_low}&ndash;{results.estimated_score_high}
          </p>
          <p className="mt-2 text-sm text-white/60">
            Estimated score range, not an official score. Based on {responses.length} questions
            answered in a {attempt.mode === "quick" ? "Quick" : "Full"} Diagnostic.
          </p>
        </Card>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Card padding="md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Overall accuracy</p>
            <p className="mt-1 text-2xl font-black text-white">{results.overall_accuracy}%</p>
          </Card>
          {Object.entries(results.section_results).map(([section, stats]) => (
            <Card key={section} padding="md">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                {SECTION_LABELS[section] || section}
              </p>
              <p className="mt-1 text-2xl font-black text-white">{stats.accuracy}%</p>
              <p className="text-xs text-white/50">{stats.correct}/{stats.total} correct</p>
            </Card>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card tone="emerald" padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Strongest skills</p>
            <p className="mt-2 text-sm text-white/70">
              You are currently strongest in{" "}
              {results.strongest_skills.map((s) => s.skill).join(", ") || "no clear standout yet"}.
            </p>
            <ul className="mt-3 space-y-1.5">
              {results.strongest_skills.map((s) => (
                <li key={s.skill} className="flex items-center justify-between text-sm">
                  <span className="text-white/80">
                    {s.skill}
                    {s.lowConfidence && (
                      <span className="ml-1.5 text-[10px] font-semibold text-white/35">(1-2 questions)</span>
                    )}
                  </span>
                  <span className="font-bold text-emerald-300">{s.accuracy}%</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card tone="amber" padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Highest-priority areas</p>
            <p className="mt-2 text-sm text-white/70">
              Your highest-priority areas are{" "}
              {results.weakest_skills.map((s) => s.skill).join(", ") || "not yet clear -- take another module"}.
              This isn&apos;t permanent -- it&apos;s just where focused practice will help most right now.
            </p>
            <ul className="mt-3 space-y-1.5">
              {results.weakest_skills.map((s) => (
                <li key={s.skill} className="flex items-center justify-between text-sm">
                  <span className="text-white/80">
                    {s.skill}
                    {s.lowConfidence && (
                      <span className="ml-1.5 text-[10px] font-semibold text-white/35">(1-2 questions)</span>
                    )}
                  </span>
                  <span className="font-bold text-amber-300">{s.accuracy}%</span>
                </li>
              ))}
            </ul>
            {results.weakest_skills.some((s) => s.lowConfidence) && (
              <p className="mt-2 text-[11px] text-white/40">
                Skills marked &ldquo;1-2 questions&rdquo; are early signals, not confirmed weaknesses yet -- a retake
                or more practice will sharpen this.
              </p>
            )}
          </Card>
        </div>

        <Card className="mt-4" padding="md">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Domain breakdown</p>
          <div className="mt-3 space-y-2">
            {Object.entries(results.domain_results).map(([domain, stats]) => (
              <div key={domain} className="flex items-center gap-3">
                <span className="w-48 flex-shrink-0 truncate text-sm text-white/80">{domain}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400"
                    style={{ width: `${stats.accuracy}%` }}
                  />
                </div>
                <span className="w-12 flex-shrink-0 text-right text-xs font-bold text-white/60">
                  {stats.accuracy}%
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mt-4" padding="md">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Pacing analysis</p>
          <p className="mt-2 text-sm text-white/70">
            Average {results.pacing_results.averageSecondsPerQuestion} seconds per question.{" "}
            {results.pacing_results.guessedTooQuickly.length} question
            {results.pacing_results.guessedTooQuickly.length === 1 ? "" : "s"} answered unusually quickly (possible
            guesses), and {results.pacing_results.spentTooLong.length} question
            {results.pacing_results.spentTooLong.length === 1 ? "" : "s"} where a lot of extra time was spent.
          </p>
        </Card>

        {resources.length > 0 && (
          <Card className="mt-4" padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Recommended resources</p>
            <div className="mt-3 space-y-2">
              {resources.map((resource) => (
                <a
                  key={resource.url}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void trackEvent("recommended_resource_clicked", { attemptId, url: resource.url })}
                  className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-cyan-300/40"
                >
                  <p className="text-sm font-bold text-white">{resource.title}</p>
                  <p className="mt-1 text-xs text-white/50">
                    {resource.source} &middot; {resource.trustTier}
                  </p>
                </a>
              ))}
            </div>
          </Card>
        )}

        <Card className="mt-4" padding="md">
          <p className="text-xs font-bold uppercase tracking-wider text-white/40">Suggested retake date</p>
          <p className="mt-2 text-sm text-white/70">
            {suggestedRetakeDate(attempt.completed_at, attempt.mode)} -- enough time to work through your
            highest-priority areas before checking progress again.
          </p>
        </Card>

        {hasActivePlan && (
          <p className="mt-6 text-xs text-white/40">
            You already have an active study plan for this exam -- continuing will refresh your upcoming
            tasks using these new results and keep everything you&apos;ve already completed.
          </p>
        )}

        <div className={`${hasActivePlan ? "mt-3" : "mt-6"} flex flex-wrap gap-3`}>
          <Button
            variant="primary"
            href={`/study-plans/new?diagnosticAttemptId=${attemptId}`}
          >
            {hasActivePlan ? "Update My Study Plan" : "Create a Study Plan"}
          </Button>
          <Button variant="ghost" onClick={() => setShowFullReview((v) => !v)}>
            {showFullReview ? "Hide full answer review" : "Show full answer review"}
          </Button>
        </div>

        {showFullReview && (
          <div className="mt-4 space-y-3">
            {responses.map((response) => (
              <Card
                key={response.question_id}
                padding="md"
                className={response.is_correct ? "border-emerald-400/20" : "border-red-400/20"}
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  <span>{response.question.domain}</span>
                  <span>&middot;</span>
                  <span>{response.question.skill}</span>
                  <span>&middot;</span>
                  <span className={response.is_correct ? "text-emerald-300" : "text-red-300"}>
                    {response.is_correct ? "Correct" : "Incorrect"}
                  </span>
                </div>
                {response.question.stimulus && (
                  <p className="mt-2 text-xs text-white/60">{response.question.stimulus}</p>
                )}
                <p className="mt-2 text-sm text-white">{response.question.question_text}</p>
                {response.question.answer_choices ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {response.question.answer_choices.map((choice) => (
                      <li
                        key={choice.id}
                        className={
                          choice.id === response.question.correct_answer
                            ? "font-bold text-emerald-300"
                            : choice.id === response.selected_answer
                              ? "font-bold text-red-300"
                              : "text-white/60"
                        }
                      >
                        {choice.id}. {choice.text}
                        {choice.id === response.question.correct_answer ? " (correct)" : ""}
                        {choice.id === response.selected_answer && choice.id !== response.question.correct_answer
                          ? " (your answer)"
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-white/60">
                    Correct answer: <span className="font-bold text-emerald-300">{response.question.correct_answer}</span>
                    {response.selected_answer ? ` -- your answer: ${response.selected_answer}` : " -- not answered"}
                  </p>
                )}
                <p className="mt-2 text-xs text-white/50">{response.question.explanation}</p>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-white/35">{attempt.exam.disclaimer}</p>
      </div>
    </main>
  );
}
