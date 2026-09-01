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
import { useProgress } from "@/lib/useProgress";

// Home answers exactly one question: what should I study right now?
//
// The order on this screen is the design. A greeting, one input, one
// recommended action -- and only then progress, quests and today's plan.
// Progression lives *below* the primary action rather than in a stat grid
// at the top, because a screen where six things look equally important
// reads the same as a screen where nothing is.
//
// Nothing here is decorative. Every number comes from the database, and a
// section with nothing real to say renders nothing at all rather than a
// placeholder zero.

// Offered to an account with nothing in it yet. Deliberately three, and
// deliberately ordinary school subjects: the point is to remove the "what
// do I even type?" pause, not to show off range.
const STARTER_TOPICS = [
  "Photosynthesis",
  "The French Revolution",
  "Quadratic equations",
];

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
      <p
        className="truncate text-[15px] font-medium"
        style={{ color: "var(--text-1)" }}
      >
        {title}
      </p>
      <p className="t-meta mt-1 truncate">{detail}</p>
      {mastery !== null && (
        <div className="meter mt-3">
          <span style={{ width: `${Math.min(100, Math.max(2, mastery))}%` }} />
        </div>
      )}
    </Link>
  );
}

function Skeletons() {
  return (
    <div className="app-page">
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

export default function HomeView() {
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const { isReady } = useRequireAuth();
  const { snapshot, isLoading } = useStudy();

  // Rendered on the client only: the greeting depends on the reader's clock,
  // and a server-rendered "Good morning" would hydrate into a mismatch.
  const [hello, setHello] = useState<string | null>(null);
  useEffect(() => setHello(greeting(new Date())), []);

  const firstName = useMemo(() => {
    const name = profile?.display_name || user?.email?.split("@")[0] || "";
    return name.split(/[\s._-]/)[0].replace(/^\w/, (c) => c.toUpperCase());
  }, [profile?.display_name, user?.email]);

  // Arriving from an exam page (/exams -> /home?track=ap) tells the composer
  // to write questions in that exam's style.
  const examTrack = searchParams.get("track");

  const next = useMemo(() => getNextAction(snapshot), [snapshot]);
  const plan = useMemo(() => getTodaysPlan(snapshot), [snapshot]);
  const recent = snapshot.decks.slice(0, 4);

  // Loaded independently of the study snapshot: a slow progression read
  // must never delay telling the student what to study.
  const { progress } = useProgress({
    hasReviewsDue: snapshot.dueTopics.length > 0,
    enabled: isReady,
  });

  if (isLoading || !isReady) return <Skeletons />;

  return (
    <div className="app-page">
      <h1 className="t-page">
        {hello || "Welcome"}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      <div className="mt-6 rise">
        <Composer
          autoFocus={snapshot.isEmpty}
          examTrack={examTrack}
          suggestions={snapshot.isEmpty ? STARTER_TOPICS : undefined}
          placeholder={
            snapshot.isEmpty
              ? "What are you studying? Type a topic, or attach your notes."
              : "What are you studying?"
          }
          footer={
            <p className="t-meta">
              Type a topic, paste your notes, or attach a PDF or photo.{" "}
              <Link
                href="/vyra"
                className="underline underline-offset-2"
                style={{ color: "var(--brand-text)" }}
              >
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

      {/* ---- Continue studying ---- */}
      {recent.length > 0 && (
        <section className="mt-10 rise">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="t-section">Continue studying</h2>
            <Link
              href="/library"
              className="text-[13px] font-medium"
              style={{ color: "var(--text-3)" }}
            >
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
                    : `${deck.mastery}% mastered`
                }
                mastery={deck.mastery}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Progress: level, streak, today's quests ---- */}
      {progress && <ProgressSummary progress={progress} />}

      {/* ---- Today's plan ---- */}
      {plan.length > 1 && (
        <section className="mt-10 rise">
          <h2 className="t-section">Today</h2>
          <ul className="card mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {plan.map((item) => (
              <li key={item.id} className="divide-y" style={{ borderColor: "var(--line)" }}>
                <Link
                  href={item.href}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--panel-raised)]"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[15px] font-medium"
                      style={{ color: "var(--text-1)" }}
                    >
                      {item.title}
                    </p>
                    <p className="t-meta truncate">{item.detail}</p>
                  </div>
                  <span className="t-meta shrink-0">{item.minutes} min</span>
                  <ArrowRightIcon
                    className="h-4 w-4 shrink-0"
                    // Decorative: the whole row is the link.
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Nothing yet ----
          The three example topics used to be rendered here as plain
          paragraphs that looked like cards, under copy telling the student
          to type one of them into the box themselves. They are now chips on
          the composer itself (one tap fills the box), so this section only
          has to explain what happens next. */}
      {snapshot.isEmpty && (
        <section className="mt-10 rise">
          <h2 className="t-section">How this works</h2>
          <ol className="card mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {[
              {
                title: "Give it your material",
                detail: "A topic, your notes, a PDF, or a photo of the page.",
              },
              {
                title: "It writes your study set",
                detail: "Notes, questions and flashcards, in about 20 seconds.",
              },
              {
                title: "Study, and it learns what you forget",
                detail: "Weak topics come back until they stop being weak.",
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
        </section>
      )}
    </div>
  );
}
