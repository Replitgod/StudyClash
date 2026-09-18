"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getNextAction, sessionHref } from "@/lib/nextAction";
import { MASTERY_TIER_LABELS } from "@/lib/masteryTiers";
import { tracksWithBanks } from "@/lib/examCatalog";
import { progressBreakdown } from "@/lib/progressBreakdown";
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
// bottom of this page as "more ways to practice" instead of competing for
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

  // Where every topic stands, in four plain buckets. It replaced "You are
  // 62% ready" -- ready for what, the student could not tell, and an
  // average hides the one topic that is about to cost them marks.
  const breakdown = useMemo(() => progressBreakdown(snapshot.topics), [snapshot.topics]);

  // The list below the opportunity card must not repeat what the card
  // already says, or the same topic appears twice on one screen.
  const featuredKey = opportunities?.[0]
    ? `${opportunities[0].deckId}-${opportunities[0].topic}`
    : null;
  const otherWeakTopics = snapshot.weakTopics
    .filter((topic) => `${topic.deckId}-${topic.topic}` !== featuredKey)
    .slice(0, 6);

  // The set each mode will use, named on the card rather than chosen
  // silently. Mistakes go to the set with the most topics needing work;
  // a test goes to whatever the student studied most recently.
  const reviewDeck =
    snapshot.decks
      .filter((deck) => deck.weakTopics.length > 0)
      .sort((a, b) => b.weakTopics.length - a.weakTopics.length)[0] || null;
  const testDeck = snapshot.decks.find((deck) => deck.mastery !== null) || snapshot.decks[0] || null;

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
            Nothing to practice yet
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Add something you are studying and AceDecks will work out what you
            should practice, and when.
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
      <p className="t-body mt-2">What to work on, and where everything stands.</p>

      {/* ---- Where everything stands ---- */}
      {breakdown.total > 0 && (
        <section className="card mt-6 p-5 sm:p-6" aria-labelledby="progress-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="progress-heading" className="text-[16px] font-medium" style={{ color: "var(--text-1)" }}>
              Your {breakdown.total} topic{breakdown.total === 1 ? "" : "s"}
            </h2>
            {snapshot.overallMastery !== null && (
              <span className="t-meta">Average mastery {snapshot.overallMastery}%</span>
            )}
          </div>

          <div
            className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--panel-raised)" }}
            role="img"
            aria-label={breakdown.buckets
              .map((b) => `${b.count} ${b.label.toLowerCase()}`)
              .join(", ")}
          >
            {breakdown.buckets
              .filter((bucket) => bucket.count > 0)
              .map((bucket) => (
                <span
                  key={bucket.id}
                  style={{
                    width: `${(bucket.count / breakdown.total) * 100}%`,
                    background: bucket.color,
                  }}
                />
              ))}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {breakdown.buckets.map((bucket) => (
              <div key={bucket.id}>
                <dt className="flex items-center gap-1.5 t-meta">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: bucket.color }}
                  />
                  {bucket.label}
                </dt>
                <dd className="mt-0.5 text-[20px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                  {bucket.count}
                </dd>
              </div>
            ))}
          </dl>

          {(snapshot.dueTopics.length > 0 || snapshot.flashcardsDue > 0) && (
            <p className="t-meta mt-4">
              Due now:{" "}
              {[
                snapshot.dueTopics.length > 0
                  ? `${snapshot.dueTopics.length} topic${snapshot.dueTopics.length === 1 ? "" : "s"}`
                  : null,
                snapshot.flashcardsDue > 0
                  ? `${snapshot.flashcardsDue} flashcard${snapshot.flashcardsDue === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" and ")}
            </p>
          )}
        </section>
      )}

      {/* ---- Three modes ---- */}
      <section className="mt-8">
        <div className="grid gap-3">
          <ModeCard
            primary
            title={next ? next.label : "Smart practice"}
            description={next ? `${next.reason} · about ${next.minutes} min` : "AceDecks picks what you need next."}
            href={next?.href || sessionHref({ deckId: snapshot.decks[0].id })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              title="Take a test"
              description={
                testDeck
                  ? `10 questions from ${testDeck.title}. No hints until the end.`
                  : "10 questions, no hints until the end."
              }
              href={testDeck ? sessionHref({ deckId: testDeck.id, mode: "test", limit: 10 }) : "/library"}
              disabled={!testDeck}
            />
            <ModeCard
              title="Review mistakes"
              description={
                reviewDeck
                  ? `Only what you got wrong last time, in ${reviewDeck.title}.`
                  : "Nothing to review yet. Mistakes show up here after you practice."
              }
              href={reviewDeck ? sessionHref({ deckId: reviewDeck.id, mode: "mistakes" }) : "/library"}
              disabled={!reviewDeck}
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
                    <p className="t-meta truncate">
                      {topic.deckTitle}
                      {topic.confidentMisses > 0
                        ? ` · sure but wrong ${topic.confidentMisses === 1 ? "once" : `${topic.confidentMisses} times`}`
                        : ""}
                    </p>
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
        <h2 className="t-section">More ways to practice</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            {
              href: "/exams",
              label: "Exam practice",
              // Generated from the catalog rather than written down. This
              // line said "AP, SAT, MCAT, LSAT, NCLEX" long after two of
              // those had no questions behind them and two that did were
              // missing from it.
              detail: `Original questions for ${tracksWithBanks()
                .map((track) => track.name)
                .join(", ")}`,
            },
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
