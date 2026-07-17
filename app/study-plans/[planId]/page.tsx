"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { phaseLabel } from "@/lib/studyPlanGenerator";

type StudyPlan = {
  id: string;
  title: string;
  source_type: "diagnostic" | "battle_assessment";
  diagnostic_attempt_id: string | null;
  exam_type: string | null;
  assessment_type: string | null;
  assessment_name: string | null;
  assessment_date: string;
  target_score: string | null;
  minutes_per_day: number;
  status: "active" | "completed" | "archived";
};

type StudyPlanTask = {
  id: string;
  scheduled_date: string;
  topic: string;
  task_type: string;
  title: string;
  description: string;
  estimated_minutes: number;
  resource_links: { title: string; url: string; internal?: boolean }[];
  completed: boolean;
  completed_at: string | null;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Same interval logic as suggestedRetakeDate on the diagnostic results
// page (21 days for a Quick Diagnostic, 35 for Full) -- kept as a small
// local helper rather than a shared import since it's five lines and this
// page only needs it for one card.
function nextDiagnosticDate(completedAtIso: string, mode: "quick" | "full"): string {
  const completed = new Date(completedAtIso);
  const daysToAdd = mode === "quick" ? 21 : 35;
  const next = new Date(completed.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return next.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function StudyPlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = String(params.planId || "");
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [tasks, setTasks] = useState<StudyPlanTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const [retakeReminder, setRetakeReminder] = useState<string | null>(null);

  const load = async () => {
    const [{ data: planData, error: planError }, { data: taskData }] = await Promise.all([
      supabase.from("study_plans").select("*").eq("id", planId).single(),
      supabase.from("study_plan_tasks").select("*").eq("study_plan_id", planId).order("scheduled_date", { ascending: true }),
    ]);

    if (planError || !planData) {
      setError("Study plan not found.");
      setIsLoading(false);
      return;
    }

    setPlan(planData as StudyPlan);
    setTasks((taskData || []) as StudyPlanTask[]);
    setIsLoading(false);

    if (planData.source_type === "diagnostic" && planData.diagnostic_attempt_id) {
      const { data: attempt } = await supabase
        .from("diagnostic_attempts")
        .select("completed_at, mode")
        .eq("id", planData.diagnostic_attempt_id)
        .maybeSingle();

      if (attempt?.completed_at) {
        setRetakeReminder(nextDiagnosticDate(attempt.completed_at, attempt.mode));
      }
    }
  };

  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      router.push(`/login?redirect=/study-plans/${planId}`);
      return;
    }
    if (isLoggedIn) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, isAuthLoading, planId]);

  const toggleComplete = async (task: StudyPlanTask) => {
    const nextCompleted = !task.completed;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted, completed_at: nextCompleted ? new Date().toISOString() : null } : t))
    );

    const { error: updateError } = await supabase
      .from("study_plan_tasks")
      .update({ completed: nextCompleted, completed_at: nextCompleted ? new Date().toISOString() : null })
      .eq("id", task.id);

    if (!updateError && nextCompleted) {
      void trackEvent("study_plan_task_completed", { planId, taskId: task.id });
    }
  };

  const rescheduleTask = async (task: StudyPlanTask, newDate: string) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, scheduled_date: newDate } : t)));
    await supabase.from("study_plan_tasks").update({ scheduled_date: newDate }).eq("id", task.id);
    void trackEvent("study_plan_rescheduled", { planId, taskId: task.id });
  };

  const handleRebalance = async () => {
    setIsRebalancing(true);
    try {
      const response = await authFetch(`/api/study-plans/${planId}/rebalance`, { method: "POST" });
      if (response.ok) await load();
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleArchive = async () => {
    await supabase.from("study_plans").update({ status: "archived" }).eq("id", planId);
    setPlan((prev) => (prev ? { ...prev, status: "archived" } : prev));
  };

  const today = todayKey();
  const todayTasks = tasks.filter((t) => t.scheduled_date === today);
  const overdueTasks = tasks.filter((t) => !t.completed && t.scheduled_date < today);

  const weekGroups = useMemo(() => {
    const groups = new Map<string, StudyPlanTask[]>();
    tasks.forEach((task) => {
      const date = new Date(`${task.scheduled_date}T00:00:00`);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  if (isLoading || isAuthLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#05050a] text-white">
        <p className="text-sm text-white/50">Loading your plan...</p>
      </main>
    );
  }

  if (error || !plan) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#05050a] px-4 text-center text-white">
        <p className="text-sm text-red-300">{error || "Plan not found."}</p>
        <Link href="/dashboard" className="text-sm font-semibold text-indigo-300">
          &larr; Back to dashboard
        </Link>
      </main>
    );
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(`${plan.assessment_date}T00:00:00`).getTime() - nowMs) / (1000 * 60 * 60 * 24))
  );

  return (
    <main className="min-h-dvh bg-[#05050a] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="text-sm font-semibold text-indigo-300">
          &larr; Back to dashboard
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{plan.title}</h1>
            <p className="mt-1 text-sm text-white/60">
              {plan.assessment_name || plan.assessment_type} &middot; {daysRemaining} day{daysRemaining === 1 ? "" : "s"}{" "}
              remaining &middot; {plan.status}
            </p>
          </div>
          {plan.status === "active" && (
            <Button variant="ghost" size="sm" onClick={handleArchive}>
              Archive plan
            </Button>
          )}
        </div>

        {overdueTasks.length > 0 && (
          <Card tone="amber" className="mt-5" padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                {overdueTasks.length} overdue task{overdueTasks.length === 1 ? "" : "s"}
              </p>
              <Button variant="secondary" size="sm" isLoading={isRebalancing} onClick={handleRebalance}>
                Rebalance my schedule
              </Button>
            </div>
          </Card>
        )}

        {retakeReminder && plan.exam_type && (
          <Card tone="violet" className="mt-5" padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Next diagnostic recommended</p>
                <p className="mt-1 text-sm text-white/70">
                  Retake around {retakeReminder} so this plan updates with your latest weak skills.
                </p>
              </div>
              <Link
                href={`/diagnostics/${plan.exam_type}`}
                className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-bold text-indigo-100"
              >
                Retake Diagnostic
              </Link>
            </div>
          </Card>
        )}

        <Card tone="cyan" className="mt-4" padding="md">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Today</p>
          {todayTasks.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">Nothing scheduled today.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {todayTasks.map((task) => (
                <TaskRow key={task.id} task={task} onToggle={toggleComplete} onReschedule={rescheduleTask} />
              ))}
            </div>
          )}
        </Card>

        <div className="mt-6 space-y-6">
          {weekGroups.map(([weekStart, weekTasks]) => {
            const completedCount = weekTasks.filter((t) => t.completed).length;
            const completionPercent = Math.round((completedCount / weekTasks.length) * 100);
            return (
              <div key={weekStart}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/40">
                    Week of {new Date(`${weekStart}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-xs font-bold text-white/50">{completionPercent}% complete</p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-400" style={{ width: `${completionPercent}%` }} />
                </div>
                <div className="mt-3 space-y-2">
                  {weekTasks.map((task) => (
                    <TaskRow key={task.id} task={task} onToggle={toggleComplete} onReschedule={rescheduleTask} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function TaskRow({
  task,
  onToggle,
  onReschedule,
}: {
  task: StudyPlanTask;
  onToggle: (task: StudyPlanTask) => void;
  onReschedule: (task: StudyPlanTask, date: string) => void;
}) {
  const isOverdue = !task.completed && task.scheduled_date < todayKey();

  return (
    <div
      className={`rounded-xl border p-3 ${
        task.completed
          ? "border-green-400/20 bg-green-500/[0.04] opacity-70"
          : isOverdue
            ? "border-amber-400/30 bg-amber-500/[0.05]"
            : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onToggle(task)}
          aria-pressed={task.completed}
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
            task.completed ? "border-green-400 bg-green-500/30" : "border-white/25"
          }`}
        >
          {task.completed && (
            <svg className="h-3.5 w-3.5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
            <span>{phaseLabel(task.task_type)}</span>
            <span>&middot;</span>
            <span>{task.estimated_minutes} min</span>
          </div>
          <p className={`text-sm font-semibold ${task.completed ? "text-white/50 line-through" : "text-white"}`}>
            {task.title}
          </p>
          <p className="mt-1 text-xs text-white/50">{task.description}</p>

          {task.resource_links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {task.resource_links.map((resource) =>
                resource.internal ? (
                  <Link
                    key={resource.url}
                    href={resource.url}
                    className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-100 hover:border-indigo-300/50 hover:bg-indigo-500/20"
                  >
                    {resource.title} →
                  </Link>
                ) : (
                  <a
                    key={resource.url}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-indigo-300 underline underline-offset-2"
                  >
                    {resource.title} ↗
                  </a>
                )
              )}
            </div>
          )}

          {isOverdue && (
            <input
              type="date"
              defaultValue={task.scheduled_date}
              onChange={(e) => e.target.value && onReschedule(task, e.target.value)}
              className="mt-2 rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-xs text-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
