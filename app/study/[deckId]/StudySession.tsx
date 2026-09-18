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
  calibration,
  describeCalibration,
  normalizeTopicKey,
  parseTopics,
  restoreSession,
  scoreFor,
  sessionStorageKey,
  summarize,
  type Confidence,
  type SavedSession,
  type SessionAnswer,
  type SessionQuestion,
} from "@/lib/studySession";
import {
  adaptDifficulty,
  INITIAL_ADAPTIVE_STATE,
  planSession,
  reorderRemaining,
  retryPosition,
  type AdaptiveState,
  type QuestionHistory,
} from "@/lib/adaptiveSession";
import { MathText } from "@/app/components/ui/MathText";
import { ArrowRightIcon, CheckIcon, CloseIcon } from "@/app/components/app/Icons";
import { MistakeRecovery } from "@/app/components/study/MistakeRecovery";
import type { RecoveryOutcome } from "@/lib/mistakeRecovery";
import { localDateKey, QUEST_CATALOGUE, type QuestKey } from "@/lib/progression";
import { copyTextToClipboard } from "@/lib/clipboard";

// What /api/battle/finish reports back about a saved session.
type SessionProgression = {
  xpAwarded: number;
  level: number;
  leveledUp: boolean;
  currentStreak: number;
  streakExtended: boolean;
  usedFreeze: boolean;
  questsCompleted: QuestKey[];
  achievementsEarned: string[];
};

// The study session.
//
// Everything that is not the question is gone: no sidebar, no opponent, no
// score ticker. A progress bar, the question, the choices, and one row of
// buttons that checks the answer AND records how sure the student was.
//
// Three shapes of the same screen:
//
//   study     (default) feedback after every answer: why the pick was
//             wrong, the explanation, a follow-up on the same idea, and the
//             missed question itself coming back a few questions later
//   test      no feedback until the end, then a full review -- the
//             testing effect needs the retrieval to happen without the
//             answer arriving straight after it
//   mistakes  only the questions the student got wrong last time
//
// It shares its finish endpoint with the older battle screen, so mastery,
// review scheduling and history all update the same way.

type DeckRecord = { id: string; title: string; course_name: string };
type SessionMode = "study" | "test" | "mistakes";

const MAX_QUESTIONS = 50;
const RETRY_SUFFIX = "#retry";

const CONFIDENCE_OPTIONS: Array<{ id: Confidence; label: string; key: string }> = [
  { id: "sure", label: "I'm sure", key: "s" },
  { id: "unsure", label: "Not sure", key: "u" },
  { id: "guess", label: "Guessing", key: "g" },
];

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 from Math.random -- only reached on very old browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private browsing or a full quota: the session still works, it just
    // cannot survive a refresh.
  }
}

async function loadQuestions(deckId: string) {
  const base =
    "id, question_text, answer_choices, correct_answer, explanation, topic, difficulty, question_type";
  // choice_feedback arrives with 20260918_02. Selecting an unknown column is
  // a hard error rather than a null, so ask for it and fall back.
  const withFeedback = await supabase
    .from("questions")
    .select(`${base}, choice_feedback`)
    .eq("deck_id", deckId);
  if (!withFeedback.error) return withFeedback;
  return supabase.from("questions").select(base).eq("deck_id", deckId);
}

export default function StudySession() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deckId = String(params?.deckId || "");

  const { user, profile } = useAuth();
  const { isReady } = useRequireAuth();
  const { refresh, snapshot } = useStudy();

  const rawMode = searchParams.get("mode");
  const mode: SessionMode = rawMode === "test" ? "test" : rawMode === "mistakes" ? "mistakes" : "study";
  const isTest = mode === "test";

  const [deck, setDeck] = useState<DeckRecord | null>(null);
  const [byId, setById] = useState<Map<string, SessionQuestion>>(new Map());
  const [order, setOrder] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [narrowingFailed, setNarrowingFailed] = useState(false);
  const [nothingMissed, setNothingMissed] = useState(false);
  const [resumed, setResumed] = useState(false);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [progression, setProgression] = useState<SessionProgression | null>(null);
  const [shareState, setShareState] = useState<"idle" | "working" | "copied" | "failed">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  // Questions missed and then answered right later -- on the follow-up, or
  // when the question itself came back. Credited to mastery as a recovery.
  const [recoveredIds, setRecoveredIds] = useState<string[]>([]);
  const [adaptive, setAdaptive] = useState<AdaptiveState>(INITIAL_ADAPTIVE_STATE);

  const questionShownAtRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  // One id for the life of this session, so a retried save is recognised
  // as the same session rather than recorded twice.
  const requestIdRef = useRef<string>(newRequestId());
  // Guards the finish call: two quick Enters on the last question used to
  // be able to fire it twice.
  const finishingRef = useRef(false);

  const snapshotTopicsRef = useRef(snapshot.topics);
  useEffect(() => {
    snapshotTopicsRef.current = snapshot.topics;
  }, [snapshot.topics]);

  const topics = useMemo(() => parseTopics(searchParams.get("topics")), [searchParams]);
  const limit = useMemo(() => {
    const raw = Number(searchParams.get("limit"));
    return Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_QUESTIONS) : null;
  }, [searchParams]);
  // Which session this is, for resuming. Two different links into the same
  // deck are two different sessions.
  const scope = useMemo(() => {
    const keep = new URLSearchParams();
    for (const key of ["mode", "topics", "limit"]) {
      const value = searchParams.get(key);
      if (value) keep.set(key, value);
    }
    return keep.toString();
  }, [searchParams]);

  /* ---------------------------------------------------------------- load */

  useEffect(() => {
    if (!deckId || !isReady) return;

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      supabase.from("decks").select("id, title, course_name").eq("id", deckId).maybeSingle(),
      loadQuestions(deckId),
      authFetch(`/api/study/review-schedule?deckId=${encodeURIComponent(deckId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([deckResult, questionResult, scheduleResult]) => {
        if (cancelled) return;

        if (deckResult.error || !deckResult.data) {
          setLoadError("We couldn't find this study set. It may have been deleted.");
          setIsLoading(false);
          return;
        }

        const all = (questionResult.data || []) as SessionQuestion[];

        // Open-response decks need the grading flow only the older session
        // screen implements.
        const needsFullEngine = all.some(
          (q) => q.question_type === "open_response" || (q.answer_choices?.length ?? 0) < 2
        );
        if (needsFullEngine) {
          router.replace(`/battle/${deckId}${window.location.search}`);
          return;
        }

        if (all.length === 0) {
          setLoadError("This study set has no questions yet.");
          setIsLoading(false);
          return;
        }

        const now = Date.now();
        const questionMap = new Map(all.map((q) => [q.id, q]));

        // Pick an unfinished session back up before planning a new one.
        const restored = restoreSession({
          raw: readStorage(sessionStorageKey(deckId)),
          deckId,
          scope,
          questionIds: new Set(questionMap.keys()),
          now,
        });

        setDeck(deckResult.data as DeckRecord);
        setById(questionMap);

        if (restored) {
          setOrder(restored.order);
          setIndex(restored.index);
          setAnswers(restored.answers);
          setRecoveredIds(restored.recoveredIds);
          startedAtRef.current = restored.startedAt;
          questionShownAtRef.current = now;
          setResumed(true);
          setIsLoading(false);
          return;
        }

        const history: QuestionHistory[] = Array.isArray(scheduleResult?.questions)
          ? scheduleResult.questions.map(
              (row: { question_id: string; correct_streak: number | null; next_review_at: string | null }) => ({
                questionId: row.question_id,
                correctStreak: row.correct_streak ?? 0,
                isDue: row.next_review_at ? Date.parse(row.next_review_at) <= now : false,
              })
            )
          : [];

        const topicPriorities = snapshotTopicsRef.current
          .filter((topic) => topic.deckId === deckId)
          .map((topic) => ({
            topic: normalizeTopicKey(topic.topic),
            priority: topic.priority,
            isDue: topic.isDue,
          }));

        const plan = planSession({
          questions: all,
          topics,
          limit,
          topicPriorities,
          history,
          onlyMissed: mode === "mistakes",
          seed: now % 2147483647,
        });

        setOrder(plan.questions.map((q) => q.id));
        setNarrowingFailed(plan.didFallBack);
        setNothingMissed(mode === "mistakes" && plan.questions.length === 0);
        setIsLoading(false);

        startedAtRef.current = now;
        questionShownAtRef.current = now;
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("We couldn't load this session. Check your connection and try again.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deckId, isReady, topics, limit, router, scope, mode]);

  const currentKey = order[index];
  const isRetry = Boolean(currentKey?.endsWith(RETRY_SUFFIX));
  const current = currentKey ? byId.get(currentKey.replace(RETRY_SUFFIX, "")) : undefined;
  const isLast = index >= order.length - 1;

  // Persist after every change that matters, so a refresh resumes here.
  useEffect(() => {
    if (!deckId || isFinished || order.length === 0 || answers.length === 0) return;
    const saved: SavedSession = {
      version: 1,
      deckId,
      scope,
      order,
      index: checked ? Math.min(index + 1, order.length - 1) : index,
      answers,
      recoveredIds,
      startedAt: startedAtRef.current,
      savedAt: Date.now(),
    };
    // A session whose last answer is in is finished, not resumable.
    if (checked && isLast) return;
    writeStorage(sessionStorageKey(deckId), JSON.stringify(saved));
  }, [deckId, scope, order, index, answers, recoveredIds, checked, isFinished, isLast]);

  // Test mode shows a clock. Study mode deliberately does not.
  useEffect(() => {
    if (!isTest || isFinished || isLoading) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(timer);
  }, [isTest, isFinished, isLoading]);

  /* -------------------------------------------------------------- answer */

  const markRecovered = useCallback((questionId: string) => {
    setRecoveredIds((prev) => (prev.includes(questionId) ? prev : [...prev, questionId]));
  }, []);

  const recordRecovery = useCallback(
    (outcome: RecoveryOutcome) => {
      if (outcome === "recovered" && current) markRecovered(current.id);
    },
    [current, markRecovered]
  );

  const check = useCallback(
    (chosenConfidence: Confidence | null) => {
      if (!current || selected === null || checked) return;

      const isRight = selected === current.correct_answer;
      setConfidence(chosenConfidence);
      setChecked(true);

      // A returning question is a second chance, not a second answer: it
      // proves recovery when right, and the original miss still stands.
      if (isRetry) {
        if (isRight) markRecovered(current.id);
        return;
      }

      setAnswers((prev) => [
        ...prev,
        {
          questionId: current.id,
          selectedAnswer: selected,
          isCorrect: isRight,
          responseTimeMs: Math.max(0, Date.now() - questionShownAtRef.current),
          ...(chosenConfidence ? { confidence: chosenConfidence } : {}),
        },
      ]);

      const nextState = adaptDifficulty(adaptive, { isCorrect: isRight, topic: current.topic });
      setAdaptive(nextState);

      setOrder((prev) => {
        // Reorder what is left to where the student now is, keeping any
        // scheduled retries exactly where they were put -- moving one
        // forward would erase the gap that makes it retrieval.
        const head = prev.slice(0, index + 1);
        const rest = prev.slice(index + 1);
        const retrySlots = rest
          .map((key, i) => (key.endsWith(RETRY_SUFFIX) ? i : -1))
          .filter((i) => i >= 0);
        const normalKeys = rest.filter((key) => !key.endsWith(RETRY_SUFFIX));
        const reordered = reorderRemaining(
          normalKeys.map((key) => byId.get(key)).filter((q): q is SessionQuestion => Boolean(q)),
          nextState
        ).map((q) => q.id);
        const merged = [...reordered];
        for (const slot of retrySlots) merged.splice(slot, 0, rest[slot]);

        let next = [...head, ...merged];

        // In study mode a miss comes back a few questions later.
        if (!isRight && !isTest && !next.includes(`${current.id}${RETRY_SUFFIX}`)) {
          const at = retryPosition({ currentIndex: index, queueLength: next.length });
          next = [...next.slice(0, at), `${current.id}${RETRY_SUFFIX}`, ...next.slice(at)];
        }
        return next;
      });
    },
    [current, selected, checked, isRetry, adaptive, index, byId, isTest, markRecovered]
  );

  const finish = useCallback(
    async (finalAnswers: SessionAnswer[], recovered: string[]) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setElapsedMs(Date.now() - startedAtRef.current);
      setIsFinished(true);
      setIsSaving(true);
      setSaveError(null);

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
            playerName: profile?.display_name?.trim() || user?.email?.split("@")[0] || "Student",
            score: scoreFor(finalAnswers),
            totalQuestions: finalAnswers.length,
            correctAnswers: finalAnswers.filter((a) => a.isCorrect).length,
            timeTakenSeconds: elapsedSeconds,
            answers: finalAnswers,
            recoveredQuestionIds: recovered,
            clientRequestId: requestIdRef.current,
            localDate: localDateKey(new Date()),
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "We couldn't save this session.");
        }
        setMatchId(data?.matchId || null);
        setProgression(data?.progression || null);
        writeStorage(sessionStorageKey(deckId), null);
      } catch (err) {
        setSaveError(
          err instanceof Error && !err.message.includes("Failed to fetch")
            ? err.message
            : "We couldn't save this session. Check your connection and try again."
        );
        // Allowed to try again; the request id makes a retry safe.
        finishingRef.current = false;
      } finally {
        setIsSaving(false);
        refresh();
      }
    },
    [deckId, profile, user, refresh]
  );

  const advance = useCallback(() => {
    if (isLast) {
      void finish(answers, recoveredIds);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
    setConfidence(null);
    setChecked(false);
    questionShownAtRef.current = Date.now();
  }, [isLast, answers, recoveredIds, finish]);

  // Test mode records the answer and moves on in one step: there is nothing
  // to read in between.
  const submitTestAnswer = useCallback(
    (chosenConfidence: Confidence | null) => {
      if (!current || selected === null) return;
      const answer: SessionAnswer = {
        questionId: current.id,
        selectedAnswer: selected,
        isCorrect: selected === current.correct_answer,
        responseTimeMs: Math.max(0, Date.now() - questionShownAtRef.current),
        ...(chosenConfidence ? { confidence: chosenConfidence } : {}),
      };
      const nextAnswers = [...answers, answer];
      setAnswers(nextAnswers);
      if (isLast) {
        void finish(nextAnswers, recoveredIds);
        return;
      }
      setIndex((i) => i + 1);
      setSelected(null);
      setConfidence(null);
      questionShownAtRef.current = Date.now();
    },
    [current, selected, answers, isLast, finish, recoveredIds]
  );

  const commit = useCallback(
    (chosenConfidence: Confidence | null) => {
      if (isTest) submitTestAnswer(chosenConfidence);
      else check(chosenConfidence);
    },
    [isTest, submitTestAnswer, check]
  );

  const shareChallenge = useCallback(async (id: string) => {
    setShareState("working");
    try {
      const response = await authFetch("/api/challenge/create", {
        method: "POST",
        body: JSON.stringify({ matchId: id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.token) throw new Error("no token");
      const url = `${window.location.origin}/challenge/${data.token}`;
      setShareState((await copyTextToClipboard(url)) ? "copied" : "failed");
    } catch {
      setShareState("failed");
    }
  }, []);

  const startOver = useCallback(() => {
    writeStorage(sessionStorageKey(deckId), null);
    window.location.reload();
  }, [deckId]);

  // Keyboard: 1-9 pick a choice; S / U / G check with a confidence; Enter
  // checks without one, then moves on.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName) && event.key === "Enter") return;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isFinished || !current) return;

      if (event.key === "Enter") {
        event.preventDefault();
        if (checked) advance();
        else if (selected !== null) commit(null);
        return;
      }

      if (!checked) {
        const pick = Number(event.key);
        if (Number.isInteger(pick) && pick >= 1 && pick <= current.answer_choices.length) {
          event.preventDefault();
          setSelected(current.answer_choices[pick - 1]);
          return;
        }
        const option = CONFIDENCE_OPTIONS.find((o) => o.key === event.key.toLowerCase());
        if (option && selected !== null) {
          event.preventDefault();
          commit(option.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, checked, selected, isFinished, advance, commit]);

  /* ---------------------------------------------------------------- views */

  if (!isReady || isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16" aria-busy="true">
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
        <p className="t-body">{loadError || "This session isn't available."}</p>
        <Link href="/library" className="btn btn-secondary mt-6">
          Back to Library
        </Link>
      </div>
    );
  }

  if (nothingMissed) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 text-center">
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
        >
          <CheckIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-[20px] font-medium" style={{ color: "var(--text-1)" }}>
          No mistakes waiting in {deck.title}
        </h1>
        <p className="t-body mx-auto mt-2 max-w-sm">
          Everything you got wrong here, you have since got right. A mixed
          session keeps it that way.
        </p>
        <Link
          href={sessionHref({ deckId: deck.id, mode: "practice", limit: 10 })}
          className="btn btn-primary mt-6"
        >
          Practice this set
          <ArrowRightIcon className="h-[18px] w-[18px]" />
        </Link>
      </div>
    );
  }

  /* ---- Finished ---- */
  if (isFinished) {
    const questionsAsked = order
      .filter((key) => !key.endsWith(RETRY_SUFFIX))
      .map((key) => byId.get(key))
      .filter((q): q is SessionQuestion => Boolean(q));
    const result = summarize({ questions: questionsAsked, answers });
    const calib = calibration({ questions: questionsAsked, answers });
    const calibrationLine = describeCalibration(calib);
    const reviewTopics = result.review.map((r) => r.topic);
    const missed = answers
      .filter((a) => !a.isCorrect)
      .map((a) => ({ answer: a, question: byId.get(a.questionId) }))
      .filter((m): m is { answer: SessionAnswer; question: SessionQuestion } => Boolean(m.question));
    const recoveredCount = recoveredIds.length;

    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:py-20">
        <p className="t-meta">
          {deck.title}
          {isTest ? ` · test · ${formatElapsed(elapsedMs)}` : ""}
        </p>
        <h1
          className="mt-2 text-[48px] font-semibold leading-none tracking-[-0.03em] sm:text-[56px]"
          style={{ color: "var(--text-1)" }}
        >
          {result.correct}
          <span style={{ color: "var(--text-3)" }}> / {result.total}</span>
        </h1>
        <p className="t-body mt-2">
          {result.percent}% right
          {recoveredCount > 0 && !isTest
            ? ` · ${recoveredCount} fixed on the second try`
            : ""}
          {isSaving ? " · saving…" : ""}
        </p>

        {saveError && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 text-[14px]"
            style={{ borderColor: "rgb(251 191 36 / 0.3)", background: "var(--warn-soft)", color: "var(--text-1)" }}
          >
            <span className="min-w-0 flex-1">
              {saveError} Your answers are kept on this device until it saves.
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={isSaving}
              onClick={() => void finish(answers, recoveredIds)}
            >
              {isSaving ? "Saving…" : "Try again"}
            </button>
          </div>
        )}

        {calibrationLine && (
          <p className="t-body mt-6" style={{ color: "var(--text-2)" }}>
            {calibrationLine}
          </p>
        )}

        {result.strong.length > 0 && (
          <section className="mt-8">
            <h2 className="t-section">Solid</h2>
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
                <li
                  key={item.topic}
                  className={`chip ${calib.confidentMissTopics.includes(item.topic) ? "chip-bad" : "chip-warn"}`}
                >
                  {item.topic} · {item.correct}/{item.total}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- Review: every miss, with the answer and why ---- */}
        {missed.length > 0 && (
          <section className="mt-8">
            <h2 className="t-section">{isTest ? "Review your answers" : "What you missed"}</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {missed.map(({ answer, question }) => {
                const why = question.choice_feedback?.[answer.selectedAnswer];
                return (
                  <li key={question.id} className="card p-4">
                    <details>
                      <summary className="cursor-pointer list-none">
                        <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-1)" }}>
                          <MathText text={question.question_text} />
                        </p>
                        <p className="t-meta mt-2">
                          You said <MathText text={answer.selectedAnswer} />
                          {answer.confidence === "sure" ? " (and were sure)" : ""} · tap to see why
                        </p>
                      </summary>
                      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                        <p className="text-[14px]" style={{ color: "var(--ok)" }}>
                          Answer: <MathText text={question.correct_answer} />
                        </p>
                        {why && (
                          <p className="t-body mt-2 text-[14px]">
                            <MathText text={why} />
                          </p>
                        )}
                        {question.explanation && (
                          <p className="t-body mt-2 text-[14px]">
                            <MathText text={question.explanation} />
                          </p>
                        )}
                        {recoveredIds.includes(question.id) && (
                          <p className="t-meta mt-2" style={{ color: "var(--ok)" }}>
                            You got this one right when it came back.
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {progression && progression.xpAwarded > 0 && (
          <section className="mt-8 rise">
            <div
              className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3"
              style={{ background: "var(--panel-raised)" }}
            >
              <span className="text-[15px] font-medium tabular-nums" style={{ color: "var(--brand-text)" }}>
                +{progression.xpAwarded} XP
              </span>
              {progression.leveledUp && <span className="chip chip-brand">Level {progression.level}</span>}
              {progression.streakExtended && progression.currentStreak > 1 && (
                <span className="t-meta">
                  {progression.currentStreak}-day streak
                  {progression.usedFreeze ? " · freeze used" : ""}
                </span>
              )}
              {progression.questsCompleted.map((quest) => (
                <span key={quest} className="chip chip-ok">
                  {QUEST_CATALOGUE[quest]?.title || "Quest"} done
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ---- Where to go next. Never a dead end. ---- */}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {reviewTopics.length > 0 ? (
            <Link
              href={sessionHref({ deckId: deck.id, topics: reviewTopics, mode: "weak_topic", limit: 10 })}
              className="btn btn-primary btn-lg"
            >
              Practice what I missed
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
          ) : (
            <Link href="/home" className="btn btn-primary btn-lg">
              See what&rsquo;s next
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
          )}

          {matchId && (
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              disabled={shareState === "working"}
              onClick={() => void shareChallenge(matchId)}
            >
              {shareState === "copied"
                ? "Link copied"
                : shareState === "working"
                  ? "Creating…"
                  : shareState === "failed"
                    ? "Try again"
                    : "Challenge a friend"}
            </button>
          )}
        </div>

        {shareState === "copied" && (
          <p className="t-meta mt-3" aria-live="polite">
            Send that link to anyone. They can try this exact set without an
            account, and you will see how they did.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
          <Link href={`/library/${deck.id}`} className="text-[13px]" style={{ color: "var(--text-3)" }}>
            Back to {deck.title}
          </Link>
        </div>
      </div>
    );
  }

  /* ---- In session ---- */
  if (!current) return null;

  const isCorrect = checked && selected === current.correct_answer;
  const progress = Math.round((index / Math.max(order.length, 1)) * 100);
  const whyWrong = checked && !isCorrect && selected ? current.choice_feedback?.[selected] : null;

  let verdict = "";
  if (checked) {
    if (isCorrect) {
      verdict = isRetry
        ? "Got it this time."
        : confidence === "guess"
          ? "Correct, though you were guessing. It'll come back soon to check."
          : "Correct.";
    } else {
      verdict = isRetry
        ? "Still not it. This one goes to the top of your next review."
        : confidence === "sure"
          ? "Not quite, and you were sure. That's worth a close look."
          : "Not quite.";
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-10 pt-5">
      {/* ---- Progress ---- */}
      <header className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="t-meta truncate">
            {deck.title}
            {isTest ? " · test" : mode === "mistakes" ? " · your mistakes" : ""}
          </p>
          <div
            className="meter mt-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={order.length}
            aria-valuenow={index}
            aria-label="Session progress"
          >
            <span style={{ width: `${Math.max(2, progress)}%` }} />
          </div>
        </div>
        <span className="t-meta shrink-0 tabular-nums">
          {isTest ? `${formatElapsed(elapsedMs)} · ` : ""}
          {index + 1} / {order.length}
        </span>
        <Link
          href={`/library/${deck.id}`}
          aria-label="Leave. Your progress is saved."
          title="Leave. Your progress is saved."
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ color: "var(--text-3)" }}
        >
          <CloseIcon className="h-[18px] w-[18px]" />
        </Link>
      </header>

      {resumed && index > 0 && !checked && (
        <p className="t-meta mt-5">
          Picked up where you left off.{" "}
          <button type="button" onClick={startOver} className="underline underline-offset-2">
            Start over
          </button>
        </p>
      )}

      {narrowingFailed && index === 0 && (
        <p className="t-meta mt-5">
          Nothing matched those exact topics, so this session covers the whole set.
        </p>
      )}

      {isRetry && !checked && (
        <p className="t-meta mt-5" style={{ color: "var(--brand-text)" }}>
          Back again. You missed this one a few questions ago.
        </p>
      )}

      {/* ---- Question ---- */}
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="text-[20px] leading-[1.5] sm:text-[23px]" style={{ color: "var(--text-1)" }}>
          <MathText text={current.question_text} />
        </h1>

        <ul className="mt-7 flex flex-col gap-2.5" role="list">
          {current.answer_choices.map((choice, choiceIndex) => {
            const isPicked = selected === choice;
            const isAnswer = choice === current.correct_answer;

            let style: React.CSSProperties = {
              borderColor: "var(--line-strong)",
              background: "var(--panel)",
              color: "var(--text-1)",
            };
            if (checked && isAnswer) {
              style = { borderColor: "rgb(52 211 153 / 0.45)", background: "var(--ok-soft)", color: "var(--text-1)" };
            } else if (checked && isPicked) {
              style = { borderColor: "rgb(248 113 113 / 0.45)", background: "var(--bad-soft)", color: "var(--text-1)" };
            } else if (isPicked) {
              style = { borderColor: "var(--brand-line)", background: "var(--brand-soft)", color: "var(--text-1)" };
            }

            return (
              <li key={`${choiceIndex}-${choice}`}>
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
                    style={{ color: "var(--text-3)" }}
                    aria-hidden="true"
                  >
                    {choiceIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <MathText text={choice} />
                  </span>
                  {checked && isAnswer && <CheckIcon className="mt-0.5 h-[18px] w-[18px] shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>

        {/* ---- Feedback (study mode only) ---- */}
        {checked && (
          <div className="rise mt-6" aria-live="polite">
            <p
              className="text-[15px] font-medium"
              style={{ color: isCorrect ? "var(--ok)" : "var(--text-1)" }}
            >
              {verdict}
            </p>
            {whyWrong && (
              <p className="t-body mt-2">
                <span className="font-medium" style={{ color: "var(--text-1)" }}>
                  Why not that one:{" "}
                </span>
                <MathText text={whyWrong} />
              </p>
            )}
            {current.explanation && (
              <p className="t-body mt-2">
                <MathText text={current.explanation} />
              </p>
            )}
            {!isCorrect && selected !== null && !isRetry && (
              <>
                <MistakeRecovery
                  questionId={current.id}
                  selectedAnswer={selected}
                  onOutcome={recordRecovery}
                  hideMisconception={Boolean(whyWrong)}
                />
                <Link
                  href={`/vyra?about=${encodeURIComponent(current.topic || deck.title)}&question=${encodeURIComponent(current.id)}`}
                  className="btn btn-quiet btn-sm mt-3 -ml-3"
                  style={{ color: "var(--brand-text)" }}
                >
                  Still confused? Work through it with Vyra
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---- Action ---- */}
      <div className="sticky bottom-0 pb-[env(safe-area-inset-bottom,0px)]" style={{ background: "var(--app-bg)" }}>
        {checked ? (
          <button type="button" onClick={advance} className="btn btn-primary btn-lg w-full">
            {isLast ? "See how you did" : "Continue"}
            <ArrowRightIcon className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <div>
            <p className="t-meta mb-2 text-center" id="confidence-label">
              {selected === null
                ? "Pick an answer"
                : isTest
                  ? "How sure are you? This submits your answer."
                  : "How sure are you? This checks your answer."}
            </p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="confidence-label">
              {CONFIDENCE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={selected === null}
                  onClick={() => commit(option.id)}
                  className={`btn btn-lg ${option.id === "sure" ? "btn-primary" : "btn-secondary"}`}
                  aria-keyshortcuts={option.key.toUpperCase()}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
