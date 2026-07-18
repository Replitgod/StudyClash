"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { trackEvent } from "@/lib/trackEvent";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";

type ClientQuestion = {
  id: string;
  section: string;
  domain: string;
  skill: string;
  difficulty: "easy" | "medium" | "hard";
  question_type: "multiple_choice" | "student_produced_response";
  stimulus: string | null;
  question_text: string;
  answer_choices: { id: string; text: string }[] | null;
};

type AssignedItem = {
  question: ClientQuestion;
  selectedAnswer: string | null;
  flagged: boolean;
};

type ModuleState = {
  status: "loading" | "in_progress" | "module_break" | "completed" | "error";
  section?: string;
  module?: number;
  timeLimitMinutes?: number;
  moduleStartedAt?: string;
  breakMinutes?: number;
  items: AssignedItem[];
};

const SECTION_LABELS: Record<string, string> = {
  reading_writing: "Reading and Writing",
  math: "Math",
  weak_area: "Weak-Area Retest",
};

function computeRemainingSeconds(timeLimitMinutes: number, moduleStartedAt: string): number {
  const startedMs = new Date(moduleStartedAt).getTime();
  const elapsedSeconds = Number.isFinite(startedMs) ? Math.floor((Date.now() - startedMs) / 1000) : 0;
  return Math.max(0, timeLimitMinutes * 60 - elapsedSeconds);
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function DiagnosticAttemptPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = String(params.attemptId || "");
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();

  const [state, setState] = useState<ModuleState>({ status: "loading", items: [] });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const [isSubmittingModule, setIsSubmittingModule] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const submitLockRef = useRef(false);
  // Initialized to 0, not Date.now() (an impure call during render) --
  // loadCurrentState sets the real value the moment the first module's
  // questions are ready, before any response timing is actually recorded.
  const questionEnteredAtRef = useRef<number>(0);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCurrentState = useCallback(async () => {
    try {
      const response = await authFetch(`/api/diagnostics/attempt/${attemptId}`, { method: "GET" });
      const json = await response.json();

      if (!response.ok) {
        setLoadError(json.error || "Could not load this diagnostic.");
        setState((prev) => ({ ...prev, status: "error" }));
        return;
      }

      if (json.status === "completed") {
        router.push(`/diagnostics/results/${attemptId}`);
        return;
      }

      setLoadError(null);
      setState({
        status: json.status,
        section: json.section,
        module: json.module,
        timeLimitMinutes: json.timeLimitMinutes,
        moduleStartedAt: json.moduleStartedAt,
        breakMinutes: json.breakMinutes,
        items: json.items || [],
      });
      setCurrentIndex(0);
      questionEnteredAtRef.current = Date.now();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this diagnostic.");
      setState((prev) => ({ ...prev, status: "error" }));
    }
  }, [attemptId, router]);

  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      router.push(`/login?redirect=/diagnostics/attempt/${attemptId}`);
      return;
    }
    if (isLoggedIn) {
      void loadCurrentState();
    }
  }, [isLoggedIn, isAuthLoading, attemptId, loadCurrentState, router]);

  // Declared before the countdown effect below (which calls it on timeout)
  // rather than after -- referencing a function before its declaration
  // inside an effect's closure defeats the effect's ability to pick up
  // later reassignments.
  const handleSubmitModule = async (auto = false) => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmittingModule(true);
    setShowSubmitConfirm(false);

    try {
      const response = await authFetch(`/api/diagnostics/attempt/${attemptId}/submit-module`, {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok) {
        setLoadError(json.error || "Could not submit this module.");
        submitLockRef.current = false;
        setIsSubmittingModule(false);
        return;
      }

      void trackEvent("diagnostic_module_completed", {
        attemptId,
        section: state.section,
        module: state.module,
        auto,
      });

      if (json.status === "completed") {
        void trackEvent("diagnostic_completed", { attemptId });
        router.push(`/diagnostics/results/${attemptId}`);
        return;
      }

      setState({
        status: json.status,
        section: json.section,
        module: json.module,
        timeLimitMinutes: json.timeLimitMinutes,
        moduleStartedAt: json.moduleStartedAt,
        breakMinutes: json.breakMinutes,
        items: json.items || [],
      });
      setCurrentIndex(0);
      questionEnteredAtRef.current = Date.now();
      submitLockRef.current = false;
      setIsSubmittingModule(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not submit this module.");
      submitLockRef.current = false;
      setIsSubmittingModule(false);
    }
  };

  // Countdown ticks purely from moduleStartedAt + timeLimitMinutes, not a
  // client-only counter, so a page refresh mid-module recovers the correct
  // remaining time instead of resetting to a full timer.
  useEffect(() => {
    if (state.status !== "in_progress" || !state.timeLimitMinutes || !state.moduleStartedAt) return;

    const tick = () => {
      const remaining = computeRemainingSeconds(state.timeLimitMinutes as number, state.moduleStartedAt as string);
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        void handleSubmitModule(true);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.timeLimitMinutes, state.moduleStartedAt]);

  const currentItem = state.items[currentIndex];
  const answeredCount = state.items.filter((item) => item.selectedAnswer !== null && item.selectedAnswer !== "").length;

  const saveResponse = useCallback(
    (questionId: string, updates: { selectedAnswer?: string; flagged?: boolean }) => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);

      autosaveTimeoutRef.current = setTimeout(async () => {
        try {
          const responseTimeSeconds = Math.round((Date.now() - questionEnteredAtRef.current) / 1000);
          const response = await authFetch(`/api/diagnostics/attempt/${attemptId}/respond`, {
            method: "POST",
            body: JSON.stringify({ questionId, responseTimeSeconds, ...updates }),
          });
          if (!response.ok) {
            setSaveError("Your last answer could not be saved. Check your connection.");
          } else {
            setSaveError(null);
          }
        } catch {
          setSaveError("Your last answer could not be saved. Check your connection.");
        }
      }, 250);
    },
    [attemptId]
  );

  const handleSelectAnswer = (answer: string) => {
    if (!currentItem) return;
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) =>
        idx === currentIndex ? { ...item, selectedAnswer: answer } : item
      ),
    }));
    saveResponse(currentItem.question.id, { selectedAnswer: answer });
  };

  const handleToggleFlag = () => {
    if (!currentItem) return;
    const nextFlagged = !currentItem.flagged;
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item, idx) => (idx === currentIndex ? { ...item, flagged: nextFlagged } : item)),
    }));
    saveResponse(currentItem.question.id, { flagged: nextFlagged });
  };

  const goToIndex = (index: number) => {
    if (index < 0 || index >= state.items.length) return;
    setCurrentIndex(index);
    questionEnteredAtRef.current = Date.now();
    setShowNavigator(false);
  };

  const handleContinueFromBreak = async () => {
    try {
      const response = await authFetch(`/api/diagnostics/attempt/${attemptId}/resume-after-break`, {
        method: "POST",
      });
      const json = await response.json();

      if (!response.ok) {
        setLoadError(json.error || "Could not continue.");
        return;
      }

      setState({
        status: json.status,
        section: json.section,
        module: json.module,
        timeLimitMinutes: json.timeLimitMinutes,
        moduleStartedAt: json.moduleStartedAt,
        items: json.items || [],
      });
      setCurrentIndex(0);
      questionEnteredAtRef.current = Date.now();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not continue.");
    }
  };

  const unansweredIndices = useMemo(
    () => state.items.map((item, idx) => (item.selectedAnswer ? -1 : idx)).filter((idx) => idx >= 0),
    [state.items]
  );

  // Keyboard navigation: left/right to move between questions, 1-4 (or A-D)
  // to pick a multiple-choice answer.
  useEffect(() => {
    if (state.status !== "in_progress") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goToIndex(currentIndex + 1);
      if (event.key === "ArrowLeft") goToIndex(currentIndex - 1);

      if (currentItem?.question.question_type === "multiple_choice" && currentItem.question.answer_choices) {
        const numberMatch = event.key.match(/^[1-4]$/);
        if (numberMatch) {
          const choice = currentItem.question.answer_choices[Number(numberMatch[0]) - 1];
          if (choice) handleSelectAnswer(choice.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, currentIndex, currentItem]);

  if (state.status === "loading" || isAuthLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#05050a] text-white">
        <p className="text-sm text-white/50">Loading your diagnostic...</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#05050a] px-4 text-center text-white">
        <p className="text-sm text-red-300">{loadError || "Something went wrong."}</p>
        <Button variant="secondary" onClick={() => loadCurrentState()}>
          Try again
        </Button>
      </main>
    );
  }

  if (state.status === "module_break") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#05050a] px-4 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-300">Break</p>
        <h1 className="text-2xl font-black">Take a {state.breakMinutes || 10}-minute break</h1>
        <p className="max-w-md text-sm text-white/60">
          You&apos;ve finished {state.section ? SECTION_LABELS[state.section] || state.section : "this section"}.
          Stretch, hydrate, and come back for {state.section === "reading_writing" ? "Math" : "the next section"}.
        </p>
        <Button variant="primary" onClick={handleContinueFromBreak}>
          Continue now
        </Button>
      </main>
    );
  }

  if (!currentItem) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#05050a] text-white">
        <p className="text-sm text-white/50">No questions are available for this module right now.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#05050a] text-white">
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[#05050a]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">
              {state.section ? SECTION_LABELS[state.section] || state.section : ""}
              {state.section !== "weak_area" ? ` · Module ${state.module}` : ""}
            </p>
            <p className="text-sm font-semibold text-white/80">
              Question {currentIndex + 1} of {state.items.length}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`rounded-lg border px-3 py-1.5 text-sm font-black tabular-nums ${
                remainingSeconds <= 60
                  ? "border-red-400/40 bg-red-500/10 text-red-300"
                  : "border-white/15 bg-white/5 text-white"
              }`}
              aria-live="polite"
            >
              {formatClock(remainingSeconds)}
            </div>
            <button
              type="button"
              onClick={() => setShowNavigator(true)}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80"
            >
              Questions ({answeredCount}/{state.items.length})
            </button>
          </div>
        </div>
        {saveError && (
          <p className="mx-auto max-w-4xl px-4 pb-2 text-xs text-amber-300">{saveError}</p>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {currentItem.question.stimulus && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/80">
            {currentItem.question.stimulus}
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <p className="text-base leading-relaxed text-white">{currentItem.question.question_text}</p>
          <button
            type="button"
            onClick={handleToggleFlag}
            aria-pressed={currentItem.flagged}
            className={`flex-shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
              currentItem.flagged
                ? "border-amber-400/50 bg-amber-500/20 text-amber-200"
                : "border-white/15 bg-white/5 text-white/50"
            }`}
          >
            {currentItem.flagged ? "Flagged" : "Flag"}
          </button>
        </div>

        {currentItem.question.question_type === "multiple_choice" && currentItem.question.answer_choices ? (
          <div className="mt-6 space-y-2.5">
            {currentItem.question.answer_choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => handleSelectAnswer(choice.id)}
                aria-pressed={currentItem.selectedAnswer === choice.id}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  currentItem.selectedAnswer === choice.id
                    ? "border-indigo-400/50 bg-indigo-500/15 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/20"
                }`}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/20 text-xs font-bold">
                  {choice.id}
                </span>
                {choice.text}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <label className="text-xs font-bold uppercase tracking-wider text-white/40">
              Enter your answer
            </label>
            <input
              value={currentItem.selectedAnswer || ""}
              onChange={(e) => handleSelectAnswer(e.target.value)}
              placeholder="Type your answer"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-indigo-300/50"
            />
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => goToIndex(currentIndex - 1)} disabled={currentIndex === 0}>
            Previous
          </Button>

          {currentIndex === state.items.length - 1 ? (
            <Button variant="primary" onClick={() => setShowSubmitConfirm(true)}>
              Submit Module
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => goToIndex(currentIndex + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>

      <Modal isOpen={showSubmitConfirm} onClose={() => setShowSubmitConfirm(false)} title="Submit this module?">
        <p className="mt-2 text-sm text-white/70">
          You&apos;ve answered {answeredCount} of {state.items.length} questions.
          {unansweredIndices.length > 0
            ? ` ${unansweredIndices.length} question${unansweredIndices.length === 1 ? " is" : "s are"} still unanswered.`
            : " All questions are answered."}
          {" "}Once submitted, you cannot come back to this module.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setShowSubmitConfirm(false)}>
            Keep working
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            isLoading={isSubmittingModule}
            onClick={() => handleSubmitModule(false)}
          >
            Submit
          </Button>
        </div>
      </Modal>

      <Modal isOpen={showNavigator} onClose={() => setShowNavigator(false)} title="Question navigator">
        <div className="mt-3 grid grid-cols-6 gap-2">
          {state.items.map((item, idx) => (
            <button
              key={item.question.id}
              type="button"
              onClick={() => goToIndex(idx)}
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg border text-xs font-bold ${
                idx === currentIndex
                  ? "border-indigo-300 bg-indigo-500/20 text-white"
                  : item.selectedAnswer
                    ? "border-green-400/40 bg-green-500/10 text-green-200"
                    : "border-white/15 bg-white/5 text-white/50"
              }`}
            >
              {idx + 1}
              {item.flagged && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
              )}
            </button>
          ))}
        </div>
      </Modal>
    </main>
  );
}
