"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { sessionHref } from "@/lib/nextAction";
import {
  parseTopics,
  scoreFor,
  selectQuestions,
  summarize,
  type SessionAnswer,
  type SessionQuestion,
} from "@/lib/studySession";
import { MathText } from "@/app/components/ui/MathText";
import { ArrowRightIcon, CheckIcon, CloseIcon } from "@/app/components/app/Icons";
import { MistakeRecovery } from "@/app/components/study/MistakeRecovery";
import type { RecoveryOutcome } from "@/lib/mistakeRecovery";

// The study session.
//
// Everything that is not the question is gone: no sidebar, no opponent, no
// score ticker, no streak counter. A progress bar, the question, the
// choices, one button. After answering: whether it was right, the shortest
// useful explanation, and Continue.
//
// It shares its data and its finish endpoint with the older battle screen
// (which still exists for challenges, tournaments and rematch links), so
// mastery, review scheduling and history all update exactly the same way.

type DeckRecord = { id: string; title: string; course_name: string };

const MAX_QUESTIONS = 50;

export default function StudySession() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deckId = String(params?.deckId || "");

  const { user, profile } = useAuth();
  const { isReady } = useRequireAuth();
  const { refresh } = useStudy();

  const [deck, setDeck] = useState<DeckRecord | null>(null);
  const [questions, setQuestions] = useState<SessionQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [narrowingFailed, setNarrowingFailed] = useState(false);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);

  const questionShownAtRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);

  // Questions the student missed and then got right on the follow-up.
  // Recovery is the strongest learning signal the app collects, so it is
  // sent to the server with the session and credited to mastery there.
  const [recoveredIds, setRecoveredIds] = useState<string[]>([]);

  const topics = useMemo(
    () => parseTopics(searchParams.get("topics")),
    [searchParams]
  );
  const limit = useMemo(() => {
    const raw = Number(searchParams.get("limit"));
    return Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_QUESTIONS) : null;
  }, [searchParams]);

  /* ---------------------------------------------------------------- load */

  useEffect(() => {
    if (!deckId || !isReady) return;

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      supabase.from("decks").select("id, title, course_name").eq("id", deckId).maybeSingle(),
      supabase
        .from("questions")
        .select(
          "id, question_text, answer_choices, correct_answer, explanation, topic, difficulty, question_type"
        )
        .eq("deck_id", deckId),
    ])
      .then(([deckResult, questionResult]) => {
        if (cancelled) return;

        if (deckResult.error || !deckResult.data) {
          setLoadError("We could not find this material.");
          setIsLoading(false);
          return;
        }

        const all = (questionResult.data || []) as SessionQuestion[];

        // Open-response decks need the grading flow that only the older
        // session screen implements. Sending the student there is honest;
        // rendering an ungradeable question here would not be.
        const needsFullEngine = all.some(
          (q) => q.question_type === "open_response" || (q.answer_choices?.length ?? 0) < 2
        );
        if (needsFullEngine) {
          router.replace(`/battle/${deckId}${window.location.search}`);
          return;
        }

        if (all.length === 0) {
          setLoadError("This material has no questions yet.");
          setIsLoading(false);
          return;
        }

        const picked = selectQuestions({ questions: all, topics, limit });
        setDeck(deckResult.data as DeckRecord);
        setQuestions(picked.questions);
        setNarrowingFailed(picked.didFallBack);
        setIsLoading(false);

        const now = Date.now();
        startedAtRef.current = now;
        questionShownAtRef.current = now;
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("We could not load this session. Please try again.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deckId, isReady, topics, limit, router]);

  const current = questions[index];
  const isLast = index >= questions.length - 1;

  /* -------------------------------------------------------------- answer */

  const recordRecovery = useCallback(
    (outcome: RecoveryOutcome) => {
      if (outcome !== "recovered" || !current) return;
      setRecoveredIds((prev) =>
        prev.includes(current.id) ? prev : [...prev, current.id]
      );
    },
    [current]
  );

  const check = useCallback(() => {
    if (!current || selected === null || checked) return;

    setChecked(true);
    setAnswers((prev) => [
      ...prev,
      {
        questionId: current.id,
        selectedAnswer: selected,
        isCorrect: selected === current.correct_answer,
        responseTimeMs: Math.max(0, Date.now() - questionShownAtRef.current),
      },
    ]);
  }, [current, selected, checked]);

  const finish = useCallback(
    async (finalAnswers: SessionAnswer[]) => {
      setIsFinished(true);
      setIsSaving(true);
      setSaveError(null);

      // The per-question times are measured independently of this total, and
      // the server rejects a payload whose parts exceed the whole -- so the
      // elapsed clock has to be at least the sum of them.
      const sumMs = finalAnswers.reduce((total, a) => total + a.responseTimeMs, 0);
      const elapsedSeconds = Math.max(
        1,
        Math.ceil(Math.max(Date.now() - startedAtRef.current, sumMs) / 1000)
      );

      try {
        const response = await authFetch("/api/battle/finish", {
          method: "POST",
          body: JSON.stringify({
            deckId,
            playerName:
              profile?.display_name?.trim() || user?.email?.split("@")[0] || "Student",
            score: scoreFor(finalAnswers),
            totalQuestions: finalAnswers.length,
            correctAnswers: finalAnswers.filter((a) => a.isCorrect).length,
            timeTakenSeconds: elapsedSeconds,
            answers: finalAnswers,
            recoveredQuestionIds: recoveredIds,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "We could not save this session.");
        }
        setMatchId(data?.matchId || null);
      } catch (err) {
        // The session still counts for the student even if the write failed;
        // say so rather than pretending it saved.
        setSaveError(
          err instanceof Error
            ? err.message
            : "We could not save this session. Your answers above are still correct."
        );
      } finally {
        setIsSaving(false);
        refresh();
      }
    },
    [deckId, profile, user, refresh, recoveredIds]
  );

  const advance = useCallback(() => {
    if (isLast) {
      void finish(answers);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setChecked(false);
    questionShownAtRef.current = Date.now();
  }, [isLast, answers, finish]);

  // Enter checks the answer, then moves on. Number keys pick a choice.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (isFinished || !current) return;

      if (event.key === "Enter") {
        event.preventDefault();
        if (checked) advance();
        else if (selected !== null) check();
        return;
      }

      if (!checked) {
        const pick = Number(event.key);
        if (Number.isInteger(pick) && pick >= 1 && pick <= current.answer_choices.length) {
          event.preventDefault();
          setSelected(current.answer_choices[pick - 1]);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, checked, selected, isFinished, advance, check]);

  /* ---------------------------------------------------------------- views */

  if (!isReady || isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16">
        <div className="skeleton h-2 w-full" />
        <div className="skeleton mt-10 h-24 w-full" />
        <div className="skeleton mt-6 h-12 w-full" />
        <div className="skeleton mt-3 h-12 w-full" />
      </div>
    );
  }

  if (loadError || !deck) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 text-center">
        <p className="t-body">{loadError || "Session unavailable."}</p>
        <Link href="/library" className="btn btn-secondary mt-6">
          Back to Library
        </Link>
      </div>
    );
  }

  /* ---- Finished ---- */
  if (isFinished) {
    const result = summarize({ questions, answers });
    const reviewTopics = result.review.map((r) => r.topic);

    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:py-20">
        <p className="t-meta">{deck.title}</p>
        <h1
          className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em]"
          style={{ color: "var(--text-1)" }}
        >
          {result.percent}%
        </h1>
        <p className="t-body mt-2">
          {result.correct} of {result.total} right
          {isSaving ? " · saving…" : ""}
        </p>

        {saveError && (
          <p
            role="alert"
            className="mt-4 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[14px]"
            style={{
              borderColor: "rgb(251 191 36 / 0.3)",
              background: "var(--warn-soft)",
              color: "var(--warn)",
            }}
          >
            {saveError}
          </p>
        )}

        {result.strong.length > 0 && (
          <section className="mt-10">
            <h2 className="t-section">You are strong at</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.strong.map((item) => (
                <li key={item.topic} className="chip chip-ok">
                  {item.topic}
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.review.length > 0 && (
          <section className="mt-8">
            <h2 className="t-section">Worth another look</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {result.review.map((item) => (
                <li key={item.topic} className="chip chip-warn">
                  {item.topic} · {item.correct}/{item.total}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          {reviewTopics.length > 0 ? (
            <Link
              href={sessionHref({
                deckId: deck.id,
                topics: reviewTopics,
                mode: "weak_topic",
                limit: 10,
              })}
              className="btn btn-primary btn-lg"
            >
              Fix my mistakes
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
          ) : (
            <Link href="/home" className="btn btn-primary btn-lg">
              Done
            </Link>
          )}
          <Link href={`/library/${deck.id}`} className="btn btn-secondary btn-lg">
            Back to material
          </Link>
        </div>

        {matchId && (
          <Link
            href={`/results/${matchId}`}
            className="btn btn-quiet btn-sm mt-6 -ml-3"
            style={{ color: "var(--text-3)" }}
          >
            See the full breakdown
          </Link>
        )}
      </div>
    );
  }

  /* ---- In session ---- */
  if (!current) return null;

  const isCorrect = checked && selected === current.correct_answer;
  const progress = Math.round((index / questions.length) * 100);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-10 pt-5">
      {/* ---- Progress ---- */}
      <header className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="t-meta truncate">{deck.title}</p>
          <div className="meter mt-2">
            <span style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
        </div>
        <span className="t-meta shrink-0 tabular-nums">
          {index + 1} / {questions.length}
        </span>
        <Link
          href={`/library/${deck.id}`}
          aria-label="Leave this session"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ color: "var(--text-3)" }}
        >
          <CloseIcon className="h-[18px] w-[18px]" />
        </Link>
      </header>

      {narrowingFailed && index === 0 && (
        <p className="t-meta mt-5">
          Nothing matched those exact topics, so this session covers the whole
          set instead.
        </p>
      )}

      {/* ---- Question ---- */}
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1
          className="text-[21px] leading-[1.45] sm:text-[24px]"
          style={{ color: "var(--text-1)" }}
        >
          <MathText text={current.question_text} />
        </h1>

        <ul className="mt-7 flex flex-col gap-2.5">
          {current.answer_choices.map((choice, choiceIndex) => {
            const isPicked = selected === choice;
            const isAnswer = choice === current.correct_answer;

            let style: React.CSSProperties = {
              borderColor: "var(--line-strong)",
              background: "var(--panel)",
              color: "var(--text-1)",
            };
            if (checked && isAnswer) {
              style = {
                borderColor: "rgb(52 211 153 / 0.45)",
                background: "var(--ok-soft)",
                color: "var(--text-1)",
              };
            } else if (checked && isPicked) {
              style = {
                borderColor: "rgb(248 113 113 / 0.45)",
                background: "var(--bad-soft)",
                color: "var(--text-1)",
              };
            } else if (isPicked) {
              style = {
                borderColor: "var(--brand-line)",
                background: "var(--brand-soft)",
                color: "var(--text-1)",
              };
            }

            return (
              <li key={choice}>
                <button
                  type="button"
                  disabled={checked}
                  aria-pressed={isPicked}
                  onClick={() => setSelected(choice)}
                  className="flex w-full items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3.5 text-left text-[15.5px] leading-relaxed transition-colors disabled:cursor-default"
                  style={style}
                >
                  <span
                    className="mt-0.5 hidden w-4 shrink-0 text-[12px] tabular-nums sm:block"
                    style={{ color: "var(--text-4)" }}
                    aria-hidden="true"
                  >
                    {choiceIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <MathText text={choice} />
                  </span>
                  {checked && isAnswer && (
                    <CheckIcon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* ---- Feedback ---- */}
        {checked && (
          <div className="rise mt-6">
            <p
              className="text-[15px] font-medium"
              aria-live="polite"
              style={{ color: isCorrect ? "var(--ok)" : "var(--text-1)" }}
            >
              {isCorrect ? "Correct" : "Almost."}
            </p>
            {current.explanation && (
              <p className="t-body mt-2">
                <MathText text={current.explanation} />
              </p>
            )}
            {!isCorrect && selected !== null && (
              <>
                <MistakeRecovery
                  questionId={current.id}
                  selectedAnswer={selected}
                  onOutcome={recordRecovery}
                />
                <Link
                  href={`/vyra?about=${encodeURIComponent(
                    current.topic || deck.title
                  )}`}
                  className="btn btn-quiet btn-sm mt-3 -ml-3"
                  style={{ color: "var(--brand-text)" }}
                >
                  Ask Vyra about this
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---- Action ---- */}
      <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom,0px)]">
        {checked ? (
          <button type="button" onClick={advance} className="btn btn-primary btn-lg w-full">
            {isLast ? "See how you did" : "Continue"}
            <ArrowRightIcon className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={check}
            disabled={selected === null}
            className="btn btn-primary btn-lg w-full"
          >
            Check answer
          </button>
        )}
      </div>
    </div>
  );
}
