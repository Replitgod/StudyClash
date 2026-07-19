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
import type { AiAnalysis } from "@/app/api/diagnostics/attempt/[attemptId]/ai-analysis/route";

type AttemptMode = "quick" | "full" | "weak_area";

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
  difficulty_results: Record<"easy" | "medium" | "hard", { correct: number; total: number; accuracy: number }>;
  pacing_results: { averageSecondsPerQuestion: number; guessedTooQuickly: string[]; spentTooLong: string[] };
  strongest_skills: { skill: string; accuracy: number; sampleSize?: number; lowConfidence?: boolean }[];
  weakest_skills: { skill: string; accuracy: number; sampleSize?: number; lowConfidence?: boolean }[];
  common_mistakes: { skill: string; domain: string; missCount: number; exampleQuestionIds: string[] }[];
  confidence_score: number;
  readiness_score: number;
  readiness_tier: "needs_review" | "developing" | "strong" | "mastered";
  estimated_score_low: number | null;
  estimated_score_high: number | null;
};

type ReviewPayload = {
  attempt: {
    id: string;
    exam_id: string;
    mode: AttemptMode;
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
  weak_area: "Weak-Area Retest",
};

const READINESS_LABELS: Record<ResultsPayload["readiness_tier"], string> = {
  needs_review: "Needs Review",
  developing: "Developing",
  strong: "Strong",
  mastered: "Mastered",
};

const DIFFICULTY_LABELS: Record<"easy" | "medium" | "hard", string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

function suggestedRetakeDate(completedAtIso: string, mode: AttemptMode): string {
  const completed = new Date(completedAtIso);
  const daysToAdd = mode === "quick" ? 21 : mode === "weak_area" ? 10 : 35;
  const retake = new Date(completed.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return retake.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

type TutorAction = "explain" | "teach" | "easier" | "harder" | "similar" | "source";
type GeneratedQuestion = { questionText: string; answerChoices: { id: string; text: string }[] | null; correctAnswer: string; explanation: string };

function QuestionCard({ q }: { q: GeneratedQuestion }) {
  return (
    <div className="mt-2 rounded-lg border border-indigo-400/20 bg-indigo-500/[0.05] p-3">
      <p className="text-sm text-white">{q.questionText}</p>
      {q.answerChoices ? (
        <ul className="mt-1.5 space-y-0.5 text-xs text-white/70">
          {q.answerChoices.map((c) => (
            <li key={c.id} className={c.id === q.correctAnswer ? "font-bold text-green-300" : ""}>
              {c.id}. {c.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs font-bold text-green-300">Answer: {q.correctAnswer}</p>
      )}
      <p className="mt-1.5 text-xs text-white/50">{q.explanation}</p>
    </div>
  );
}

// The 6 AI-tutor actions the spec calls for on every missed question,
// scoped to this one question (not a general chat thread).
function TutorPanel({ attemptId, questionId }: { attemptId: string; questionId: string }) {
  const [open, setOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<TutorAction | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (action: TutorAction) => {
    setActiveAction(action);
    setIsLoading(true);
    setError(null);
    setResult(null);
    void trackEvent("diagnostic_tutor_action_clicked", { attemptId, questionId, action });
    try {
      const response = await authFetch(`/api/diagnostics/attempt/${attemptId}/question/${questionId}/tutor`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "Could not load this.");
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this.");
    } finally {
      setIsLoading(false);
    }
  };

  const ACTIONS: { key: TutorAction; label: string }[] = [
    { key: "explain", label: "Explain this" },
    { key: "teach", label: "Teach me this concept" },
    { key: "easier", label: "Easier example" },
    { key: "harder", label: "Harder question" },
    { key: "similar", label: "5 similar questions" },
    { key: "source", label: "Where was this covered?" },
  ];

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <button onClick={() => setOpen((v) => !v)} className="text-xs font-bold text-indigo-300 hover:text-indigo-200">
        {open ? "Hide AI tutor" : "Get help with this →"}
      </button>
      {open && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => runAction(a.key)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  activeAction === a.key
                    ? "border-indigo-300/50 bg-indigo-500/20 text-indigo-100"
                    : "border-white/15 bg-white/5 text-white/60 hover:border-indigo-300/30"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          {isLoading && <p className="mt-2 text-xs text-white/40">Thinking...</p>}
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

          {result && !isLoading && (
            <div className="mt-2">
              {activeAction === "explain" && <p className="text-xs text-white/70">{result.explanation}</p>}
              {activeAction === "teach" && <p className="text-xs text-white/70">{result.lesson}</p>}
              {(activeAction === "easier" || activeAction === "harder") && result.question && (
                <QuestionCard q={result.question} />
              )}
              {activeAction === "similar" && Array.isArray(result.questions) && (
                <div>{result.questions.map((q: GeneratedQuestion, i: number) => <QuestionCard key={i} q={q} />)}</div>
              )}
              {activeAction === "source" && (
                <p className="text-xs text-white/70">
                  {result.message || `${result.curriculumStandard || ""} ${result.sourceReference || ""}`.trim()}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isRetryingWeakArea, setIsRetryingWeakArea] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

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

  // AI Analysis: auto-generated once per attempt ("after the diagnostic,
  // generate an AI report" -- not gated behind an extra click), cached
  // server-side so revisiting this page never re-generates it.
  useEffect(() => {
    if (!data) return;
    setAnalysisLoading(true);
    authFetch(`/api/diagnostics/attempt/${attemptId}/ai-analysis`, { method: "GET" })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) {
          setAnalysisError(json.error || "Could not generate your analysis.");
          return;
        }
        setAnalysis(json.analysis);
      })
      .catch((err) => setAnalysisError(err instanceof Error ? err.message : "Could not generate your analysis."))
      .finally(() => setAnalysisLoading(false));
  }, [data, attemptId]);

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

  const handleRetryWeakArea = async () => {
    if (!data) return;
    setIsRetryingWeakArea(true);
    setRetryError(null);
    void trackEvent("diagnostic_retry_weak_topics_clicked", { attemptId });
    try {
      const response = await authFetch("/api/diagnostics/attempt/weak-area/start", {
        method: "POST",
        body: JSON.stringify({ examSlug: data.attempt.exam.slug }),
      });
      const json = await response.json();
      if (!response.ok) {
        setRetryError(json.error || "Could not start a weak-area retest.");
        setIsRetryingWeakArea(false);
        return;
      }
      router.push(`/diagnostics/attempt/${json.attemptId}`);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Could not start a weak-area retest.");
      setIsRetryingWeakArea(false);
    }
  };

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
        <Link href="/diagnostics" className="text-sm font-semibold text-indigo-300">
          &larr; Back to diagnostics
        </Link>
      </main>
    );
  }

  const { results, responses, attempt } = data;
  const isWeakArea = attempt.mode === "weak_area";

  return (
    <main className="min-h-dvh bg-[#05050a] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-2">
          <Link href="/diagnostics" className="text-sm font-semibold text-indigo-300">
            &larr; Back to diagnostics
          </Link>
          <Link href="/diagnostics/history" className="text-xs font-semibold text-white/50 hover:text-white/80">
            View history &rarr;
          </Link>
        </div>

        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          <span className="bg-gradient-to-r from-indigo-300 via-white to-indigo-300 bg-clip-text text-transparent">
            {attempt.exam.name} {isWeakArea ? "Weak-Area Retest Results" : "Results"}
          </span>
        </h1>

        <Card tone="fuchsia" className="mt-6" padding="lg">
          {isWeakArea ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-300">Retest accuracy</p>
              <p className="mt-2 text-4xl font-black text-white sm:text-5xl">{results.overall_accuracy}%</p>
              <p className="mt-2 text-sm text-white/60">
                Based on {responses.length} questions targeting your previously flagged weak areas.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-300">
                AcedIQ diagnostic estimate
              </p>
              <p className="mt-2 text-4xl font-black text-white sm:text-5xl">
                {results.estimated_score_low}&ndash;{results.estimated_score_high}
              </p>
              <p className="mt-2 text-sm text-white/60">
                Estimated score range, not an official score. Based on {responses.length} questions
                answered in a {attempt.mode === "quick" ? "Quick" : "Full"} Diagnostic.
              </p>
            </>
          )}
          <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
            <span className="text-xs font-bold uppercase tracking-wider text-white/40">Overall Readiness</span>
            <span className="rounded-full border border-indigo-300/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-200">
              {READINESS_LABELS[results.readiness_tier]} &middot; {results.readiness_score}/100
            </span>
            <span className="text-[11px] text-white/35">confidence {results.confidence_score}%</span>
          </div>
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

        {analysisLoading || analysis || analysisError ? (
          <Card tone="violet" className="mt-4" padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">AI Analysis</p>
            {analysisLoading && <p className="mt-2 text-sm text-white/50">Analyzing your results...</p>}
            {analysisError && <p className="mt-2 text-sm text-red-300">{analysisError}</p>}
            {analysis && !analysisLoading && (
              <div className="mt-2 space-y-3">
                <p className="text-sm text-white/80">{analysis.summary}</p>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Why you struggled</p>
                  <p className="mt-1 text-sm text-white/70">{analysis.whyStruggled}</p>
                </div>
                {analysis.downstreamConcepts && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Downstream impact</p>
                    <p className="mt-1 text-sm text-white/70">{analysis.downstreamConcepts}</p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {analysis.learnFirst.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-green-300">Learn first</p>
                      <ul className="mt-1 list-inside list-disc text-sm text-white/70">
                        {analysis.learnFirst.map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                  {analysis.canSkipForNow.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Can skip for now</p>
                      <ul className="mt-1 list-inside list-disc text-sm text-white/70">
                        {analysis.canSkipForNow.map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                {analysis.priorityOrder.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                      Priority order &middot; ~{analysis.estimatedStudyHours}h estimated
                    </p>
                    <ol className="mt-1 list-inside list-decimal text-sm text-white/70">
                      {analysis.priorityOrder.map((t) => <li key={t}>{t}</li>)}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </Card>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card tone="emerald" padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-green-300">Strongest skills</p>
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
                  <span className="font-bold text-green-300">{s.accuracy}%</span>
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
            {!isWeakArea && results.weakest_skills.length > 0 && (
              <Button variant="secondary" size="sm" className="mt-3" isLoading={isRetryingWeakArea} onClick={handleRetryWeakArea}>
                Retry weak topics only
              </Button>
            )}
            {retryError && <p className="mt-2 text-xs text-red-300">{retryError}</p>}
          </Card>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Domain breakdown</p>
            <div className="mt-3 space-y-2">
              {Object.entries(results.domain_results).map(([domain, stats]) => (
                <div key={domain} className="flex items-center gap-3">
                  <span className="w-40 flex-shrink-0 truncate text-sm text-white/80">{domain}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-400"
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

          <Card padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Difficulty breakdown</p>
            <div className="mt-3 space-y-2">
              {(["easy", "medium", "hard"] as const).map((tier) => {
                const stats = results.difficulty_results[tier];
                if (!stats || stats.total === 0) return null;
                return (
                  <div key={tier} className="flex items-center gap-3">
                    <span className="w-16 flex-shrink-0 text-sm text-white/80">{DIFFICULTY_LABELS[tier]}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-400" style={{ width: `${stats.accuracy}%` }} />
                    </div>
                    <span className="w-16 flex-shrink-0 text-right text-xs font-bold text-white/60">
                      {stats.correct}/{stats.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {results.common_mistakes.length > 0 && (
          <Card className="mt-4" padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-red-300">Most common mistakes</p>
            <ul className="mt-3 space-y-1.5">
              {results.common_mistakes.map((m) => (
                <li key={m.skill} className="flex items-center justify-between text-sm">
                  <span className="text-white/80">{m.skill} <span className="text-white/40">({m.domain})</span></span>
                  <span className="font-bold text-red-300">{m.missCount} missed</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="mt-4" padding="md">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Pacing analysis</p>
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
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Recommended resources</p>
            <div className="mt-3 space-y-2">
              {resources.map((resource) => (
                <a
                  key={resource.url}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => void trackEvent("recommended_resource_clicked", { attemptId, url: resource.url })}
                  className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-indigo-300/40"
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

        {!isWeakArea && (
          <Card className="mt-4" padding="md">
            <p className="text-xs font-bold uppercase tracking-wider text-white/40">Suggested retake date</p>
            <p className="mt-2 text-sm text-white/70">
              {suggestedRetakeDate(attempt.completed_at, attempt.mode)} -- enough time to work through your
              highest-priority areas before checking progress again.
            </p>
          </Card>
        )}

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
                className={response.is_correct ? "border-green-400/20" : "border-red-400/20"}
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  <span>{response.question.domain}</span>
                  <span>&middot;</span>
                  <span>{response.question.skill}</span>
                  <span>&middot;</span>
                  <span className={response.is_correct ? "text-green-300" : "text-red-300"}>
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
                            ? "font-bold text-green-300"
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
                    Correct answer: <span className="font-bold text-green-300">{response.question.correct_answer}</span>
                    {response.selected_answer ? ` -- your answer: ${response.selected_answer}` : " -- not answered"}
                  </p>
                )}
                <p className="mt-2 text-xs text-white/50">{response.question.explanation}</p>

                {response.is_correct === false && <TutorPanel attemptId={attemptId} questionId={response.question_id} />}
              </Card>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-white/35">{attempt.exam.disclaimer}</p>
      </div>
    </main>
  );
}
