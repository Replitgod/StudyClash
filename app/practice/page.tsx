"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getNextAction, sessionHref } from "@/lib/nextAction";
import { MASTERY_TIER_LABELS } from "@/lib/masteryTiers";
import { ArrowRightIcon } from "@/app/components/app/Icons";
import {
  OpportunityCard,
  useOpportunities,
} from "@/app/components/app/BiggestOpportunity";

// Practice is where a student deliberately trains.
//
// Three modes, and that is the whole page. Everything the app used to
// expose as its own navigation item -- diagnostics, mastery map, study
// plans, exam tunnels -- still exists and still works; it lives at the
// bottom of this page as "more ways to practise" instead of competing for
// attention with the three things that matter.

const TIER_CHIP: Record<string, string> = {
  needs_review: "chip chip-warn",
  developing: "chip",
  strong: "chip chip-ok",
  mastered: "chip chip-ok",
};

function ModeCard({
  title,
  description,
  href,
  primary = false,
  disabled = false,
}: {
  title: string;
  description: string;
  href: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="card p-5 opacity-55">
        <p className="text-[16px] font-medium" style={{ color: "var(--text-1)" }}>
          {title}
        </p>
        <p className="t-meta mt-1">{description}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="card-link group p-5"
      style={
        primary
          ? { borderColor: "var(--brand-line)", background: "var(--brand-soft)" }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-medium" style={{ color: "var(--text-1)" }}>
            {title}
          </p>
          <p className="t-meta mt-1">{description}</p>
        </div>
        <ArrowRightIcon className="mt-1 h-[18px] w-[18px] shrink-0 opacity-50" />
      </div>
    </Link>
  );
}

export default function PracticePage() {
  const { isReady } = useRequireAuth();
  const { snapshot, isLoading } = useStudy();

  const next = useMemo(() => getNextAction(snapshot), [snapshot]);

  // What is worth fixing, and what specifically is going wrong inside it.
  // Null while the recorded mistake patterns are still loading.
  const opportunities = useOpportunities(snapshot.topics);

  // Readiness: the one number a student actually wants. Everything behind
  // it (per-topic accuracy, attempt counts, review timing) stays internal.
  const readiness = snapshot.overallMastery;

  // The list below the opportunity card must not repeat what the card
  // already says, or the same topic appears twice on one screen.
  const featuredKey = opportunities?.[0]
    ? `${opportunities[0].deckId}-${opportunities[0].topic}`
    : null;
  const otherWeakTopics = snapshot.weakTopics
    .filter((topic) => `${topic.deckId}-${topic.topic}` !== featuredKey)
    .slice(0, 6);

  // Review mode targets the deck the student is weakest in overall.
  const reviewDeckId = snapshot.weakTopics[0]?.deckId || snapshot.decks[0]?.id;
  const testDeckId = snapshot.decks[0]?.id;

  if (isLoading || !isReady) {
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-44" />
        <div className="skeleton mt-8 h-[120px] w-full" />
        <div className="skeleton mt-4 h-[220px] w-full" />
      </div>
    );
  }

  if (snapshot.isEmpty) {
    return (
      <div className="app-page">
        <h1 className="t-page">Practice</h1>
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Nothing to practise yet
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Add something you are studying and AceDecks will work out what you
            should practise, and when.
          </p>
          <Link href="/home" className="btn btn-primary mt-6">
            Add material
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <h1 className="t-page">Practice</h1>
      <p className="t-body mt-2">What do you want to work on?</p>

      {/* ---- Readiness ---- */}
      {readiness !== null && (
        <div className="card mt-6 p-5 sm:p-6">
          <p
            className="text-[28px] font-semibold leading-none tracking-tight sm:text-[32px]"
            style={{ color: "var(--text-1)" }}
          >
            You are {readiness}% ready.
          </p>
          <div className="meter mt-4">
            <span style={{ width: `${Math.min(100, Math.max(2, readiness))}%` }} />
          </div>
          <p className="t-meta mt-3">
            Based on everything you have practised so far.
          </p>
        </div>
      )}

      {/* ---- Three modes ---- */}
      <section className="mt-8">
        <div className="grid gap-3">
          <ModeCard
            primary
            title="Smart practice"
            description={next ? next.reason : "AceDecks picks exactly what you need next."}
            href={next?.href || sessionHref({ deckId: snapshot.decks[0].id })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              title="Take a test"
              description="10 questions, scored, like the real thing."
              href={
                testDeckId
                  ? sessionHref({ deckId: testDeckId, mode: "practice", limit: 10 })
                  : "/library"
              }
              disabled={!testDeckId}
            />
            <ModeCard
              title="Review mistakes"
              description="Only the questions you have got wrong."
              href={
                reviewDeckId
                  ? sessionHref({ deckId: reviewDeckId, mode: "weak_topic", limit: 10 })
                  : "/library"
              }
              disabled={!reviewDeckId}
            />
          </div>
        </div>
      </section>

      {/* ---- What to fix, and what exactly is going wrong in it ---- */}
      {opportunities && opportunities.length > 0 && (
        <section className="mt-10">
          <h2 className="t-section">Your biggest opportunity</h2>
          <div className="mt-3">
            <OpportunityCard opportunity={opportunities[0]} />
          </div>
        </section>
      )}

      {/* ---- Everything else that needs work ---- */}
      {otherWeakTopics.length > 0 && (
        <section className="mt-10">
          <h2 className="t-section">
            {opportunities && opportunities.length > 0
              ? "Also worth a pass"
              : "Needs the most work"}
          </h2>
          <ul
            className="card mt-3 divide-y overflow-hidden"
            style={{ borderColor: "var(--line)" }}
          >
            {otherWeakTopics.map((topic) => (
              <li key={`${topic.deckId}-${topic.topic}`}>
                <Link
                  href={sessionHref({
                    deckId: topic.deckId,
                    topics: [topic.topic],
                    mode: "weak_topic",
                    limit: 10,
                  })}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--panel-raised)]"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-[15px] font-medium"
                      style={{ color: "var(--text-1)" }}
                    >
                      {topic.topic}
                    </p>
                    <p className="t-meta truncate">{topic.deckTitle}</p>
                  </div>
                  <span className={`${TIER_CHIP[topic.tier] || "chip"} shrink-0`}>
                    {MASTERY_TIER_LABELS[topic.tier]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Deeper tools, kept but subordinate ---- */}
      <section className="mt-12">
        <h2 className="t-section">More ways to practise</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            {
              href: "/diagnostics",
              label: "Full diagnostic test",
              detail: "Find every gap before a real exam",
            },
            {
              href: "/mastery-map",
              label: "Mastery map",
              detail: "Every topic, scored",
            },
            {
              href: "/study-plans/new",
              label: "Plan for a test date",
              // Says where a plan comes from, because it is built from a
              // diagnostic and there is nothing to schedule without one.
              detail: "A day-by-day schedule, built from a diagnostic",
            },
            {
              href: "/exams",
              label: "Exam practice",
              detail: "AP, SAT, MCAT, LSAT, NCLEX",
            },
            {
              href: "/clashrank",
              label: "Rank and leaderboards",
              detail: "Where you stand this season",
            },
            {
              href: "/friends",
              label: "Friends",
              detail: "Challenge someone you know",
            },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="card-link flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-[14px] font-medium"
                    style={{ color: "var(--text-2)" }}
                  >
                    {item.label}
                  </p>
                  <p className="t-meta truncate">{item.detail}</p>
                </div>
                <ArrowRightIcon className="ml-auto h-4 w-4 shrink-0 opacity-40" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
