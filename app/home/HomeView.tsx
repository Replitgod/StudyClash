"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getNextAction, getTodaysPlan, greeting } from "@/lib/nextAction";
import { Composer } from "@/app/components/app/Composer";
import { ArrowRightIcon } from "@/app/components/app/Icons";
import { ProgressSummary } from "@/app/components/app/ProgressSummary";
import {
  LOCAL_PROFILE_KEY,
  ONBOARDING_DISMISSED_KEY,
  Onboarding,
} from "@/app/components/app/Onboarding";
import { useProgress } from "@/lib/useProgress";
import { composerTrackForExam, resolveExamTrack } from "@/lib/examTracks";
import { EXAM_TRACKS } from "@/lib/examCatalog";
import { describeCountdown, type LearnerProfile } from "@/lib/learnerProfile";
import { trackEvent } from "@/lib/trackEvent";

// Home answers exactly one question: what should I study right now?
//
// The order on this screen is the design. A greeting (with the exam
// countdown and today's goal, when the student has one), one input, one
// recommended action -- and only then progress and today's plan. A screen
// where six things look equally important reads the same as a screen where
// nothing is.
//
// Nothing here is decorative. Every number comes from the student's own
// record, and a section with nothing real to say renders nothing at all.

// Offered to an account with nothing in it yet. Ordinary school subjects:
// the point is to remove the "what do I even type?" pause.
const STARTER_TOPICS = ["Photosynthesis", "The French Revolution", "Quadratic equations"];

function DeckCard({
  href,
  title,
  detail,
  mastery,
}: {
  href: string;
  title: string;
  detail: string;
  mastery: number | null;
}) {
  return (
    <Link href={href} className="card-link group p-4">
      <p className="truncate text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
        {title}
      </p>
      <p className="t-meta mt-1 truncate">{detail}</p>
      {mastery !== null && (
        <div className="meter mt-3" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(2, mastery))}%` }} />
        </div>
      )}
    </Link>
  );
}

function Skeletons() {
  return (
    <div className="app-page" aria-busy="true">
      <div className="skeleton h-9 w-64" />
      <div className="skeleton mt-8 h-[140px] w-full" />
      <div className="skeleton mt-10 h-5 w-36" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="skeleton h-[104px]" />
        <div className="skeleton h-[104px]" />
      </div>
    </div>
  );
}

function readLocalProfile(): LearnerProfile | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as LearnerProfile) : null;
  } catch {
    return null;
  }
}

export default function HomeView() {
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const { isReady } = useRequireAuth();
  const { snapshot, isLoading } = useStudy();

  // Client-only values: the greeting and countdown depend on the reader's
  // clock, and the saved setup lives in their browser when the server could
  // not store it. Read once after mount, so nothing hydrates mismatched.
  const [clientState, setClientState] = useState<{
    hello: string;
    now: number;
    localProfile: LearnerProfile | null;
    dismissed: boolean;
  } | null>(null);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1";
    } catch {
      dismissed = false;
    }
    setClientState({
      hello: greeting(new Date()),
      now: Date.now(),
      localProfile: readLocalProfile(),
      dismissed,
    });
  }, []);

  // Setup the student just finished in this visit, before the profile
  // reloads with it.
  const [justSaved, setJustSaved] = useState<LearnerProfile | null>(null);
  const [onboardingClosed, setOnboardingClosed] = useState(false);

  const learner: LearnerProfile | null = useMemo(() => {
    if (justSaved) return justSaved;
    if (profile?.onboarded_at) {
      return {
        educationLevel: (profile.education_level as LearnerProfile["educationLevel"]) ?? null,
        targetExam: profile.target_exam ?? null,
        examDate: profile.exam_date ?? null,
        dailyGoal: profile.daily_goal ?? null,
      };
    }
    return clientState?.localProfile ?? null;
  }, [justSaved, profile, clientState]);

  const showOnboarding =
    Boolean(profile) &&
    clientState !== null &&
    !learner &&
    !clientState.dismissed &&
    !onboardingClosed;

  const firstName = useMemo(() => {
    const name = profile?.display_name || user?.email?.split("@")[0] || "";
    return name.split(/[\s._-]/)[0].replace(/^\w/, (c) => c.toUpperCase());
  }, [profile?.display_name, user?.email]);

  // The exam the student is preparing for, from the URL (an exam page sent
  // them here) or from their setup.
  const examEntry = useMemo(
    () => EXAM_TRACKS.find((track) => track.name === learner?.targetExam) ?? null,
    [learner?.targetExam]
  );
  const urlTrack = searchParams.get("track");
  const examTrack = urlTrack || (examEntry ? composerTrackForExam(examEntry.slug) : null);
  const track = useMemo(() => resolveExamTrack(examTrack), [examTrack]);
  const arrivedForExam = Boolean(urlTrack && track);

  // A topic handed over by Vyra ("Make a practice set on ...").
  const prefill = (searchParams.get("topic") || "").slice(0, 200);

  const next = useMemo(() => getNextAction(snapshot), [snapshot]);
  const plan = useMemo(() => getTodaysPlan(snapshot), [snapshot]);
  const recent = snapshot.decks.slice(0, 4);

  const countdown = learner && clientState ? describeCountdown(learner, clientState.now) : null;
  const goal = learner?.dailyGoal ?? null;

  const { progress } = useProgress({
    hasReviewsDue: snapshot.dueTopics.length > 0,
    enabled: isReady,
  });

  if (isLoading || !isReady) return <Skeletons />;

  const dismissOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    } catch {
      // Closed for this visit either way.
    }
    setOnboardingClosed(true);
    void trackEvent("onboarding_skipped", {});
  };

  return (
    <div className="app-page">
      {arrivedForExam && track ? (
        <>
          <p className="t-section">Exam practice</p>
          <h1 className="t-page mt-2">{track.label}</h1>
          <p className="t-body mt-2">{track.blurb}</p>
          <Link href="/exams" className="t-meta mt-3 inline-block underline underline-offset-2">
            Practicing for something else?
          </Link>
        </>
      ) : (
        <>
          <h1 className="t-page">
            {clientState?.hello || "Welcome"}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          {(countdown || goal) && (
            <p className="t-body mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {countdown && <span style={{ color: "var(--text-1)" }}>{countdown}</span>}
              {countdown && goal ? <span aria-hidden="true">·</span> : null}
              {goal && (
                <span>
                  {snapshot.answeredToday >= goal
                    ? `Today's goal done: ${snapshot.answeredToday} questions`
                    : `${snapshot.answeredToday} of ${goal} questions today`}
                </span>
              )}
            </p>
          )}
        </>
      )}

      {showOnboarding && (
        <div className="mt-6">
          <Onboarding
            onDone={(saved) => {
              setJustSaved(saved);
              void trackEvent("onboarding_completed", {
                hasExam: Boolean(saved.targetExam),
                hasDate: Boolean(saved.examDate),
              });
            }}
            onSkip={dismissOnboarding}
          />
        </div>
      )}

      <div className="mt-6 rise">
        <Composer
          key={examTrack || "none"}
          autoFocus={!showOnboarding && (snapshot.isEmpty || arrivedForExam || Boolean(prefill))}
          examTrack={examTrack}
          initialValue={prefill}
          suggestions={track ? track.starters : snapshot.isEmpty ? STARTER_TOPICS : undefined}
          placeholder={
            track
              ? track.placeholder
              : snapshot.isEmpty
                ? "What are you studying? Type a topic, or attach your notes."
                : "What are you studying?"
          }
          footer={
            <p className="t-meta">
              Type a topic, paste your notes, or attach a PDF, Word or PowerPoint file, or a photo.{" "}
              <Link href="/vyra" className="underline underline-offset-2" style={{ color: "var(--brand-text)" }}>
                Or ask Vyra
              </Link>
              .
            </p>
          }
        />
      </div>

      {/* ---- The one recommended action ---- */}
      {next && (
        <section className="mt-10 rise">
          <h2 className="t-section">Do this next</h2>
          <div
            className="card mt-3 flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
            style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
                {next.label}
              </p>
              <p className="t-meta mt-1">
                {next.reason} · about {next.minutes} min
              </p>
            </div>
            <Link href={next.href} className="btn btn-primary btn-lg shrink-0">
              Start
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </section>
      )}

      {/* ---- Timed practice for the exam they are preparing for ---- */}
      {examEntry?.examSlug && !arrivedForExam && (
        <Link href={`/exams/${examEntry.slug}`} className="card-link mt-3 flex items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
              Timed {examEntry.name} practice
            </p>
            <p className="t-meta mt-0.5">
              Real format and timing, and a breakdown of your weakest areas.
            </p>
          </div>
          <ArrowRightIcon className="h-4 w-4 shrink-0 opacity-50" />
        </Link>
      )}

      {/* ---- Continue studying ---- */}
      {recent.length > 0 && (
        <section className="mt-10 rise">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="t-section">Continue studying</h2>
            <Link href="/library" className="text-[13px] font-medium" style={{ color: "var(--text-3)" }}>
              Library
            </Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {recent.map((deck) => (
              <DeckCard
                key={deck.id}
                href={`/library/${deck.id}`}
                title={deck.title}
                detail={
                  deck.mastery === null
                    ? "Not studied yet"
                    : deck.dueTopics.length > 0
                      ? `${deck.mastery}% mastered · ${deck.dueTopics.length} due`
                      : `${deck.mastery}% mastered`
                }
                mastery={deck.mastery}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Progress: this week, level, streak, today's quests ---- */}
      {progress && <ProgressSummary progress={progress} />}

      {/* ---- Today's plan ---- */}
      {plan.length > 1 && (
        <section className="mt-10 rise">
          <h2 className="t-section">Also today</h2>
          <ul className="card mt-3 divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>
            {plan.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--panel-raised)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
                      {item.title}
                    </p>
                    <p className="t-meta truncate">{item.detail}</p>
                  </div>
                  <span className="t-meta shrink-0">{item.minutes} min</span>
                  <ArrowRightIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Nothing yet ---- */}
      {snapshot.isEmpty && !showOnboarding && (
        <section className="mt-10 rise">
          <h2 className="t-section">How this works</h2>
          <ol className="card mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {[
              {
                title: "Give it what you're studying",
                detail: "A topic, your notes, a PDF or slides, or a photo of the page.",
              },
              {
                title: "Answer before you see the answer",
                detail: "Questions and flashcards, each one checked before you get it.",
              },
              {
                title: "It brings back what you're forgetting",
                detail: "Weak topics come back soon; solid ones come back just before they'd slip.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-3.5 px-4 py-3.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-medium"
                  style={{ background: "var(--brand-soft)", color: "var(--brand-text)" }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
                    {step.title}
                  </p>
                  <p className="t-meta mt-0.5">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <Link
            href="/vyra?call=1"
            className="card-link mt-3 flex items-center gap-3 px-4 py-3.5"
            onClick={() => void trackEvent("voice_tutor_opened", { from: "home_empty" })}
          >
            <div className="min-w-0">
              <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
                Or just say what you want to learn
              </p>
              <p className="t-meta mt-0.5">
                Call Vyra and name any subject. She teaches it from the start,
                and you can change topic halfway through.
              </p>
            </div>
          </Link>
        </section>
      )}
    </div>
  );
}
