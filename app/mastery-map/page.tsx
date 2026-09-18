"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStudy } from "@/lib/useStudy";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { sessionHref } from "@/lib/nextAction";
import { explainMastery } from "@/lib/mastery";
import { bucketFor, progressBreakdown, type BucketId } from "@/lib/progressBreakdown";
import type { TopicSummary } from "@/lib/studySnapshot";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// The mastery map: every topic the student has practiced, and what the app
// believes about each one.
//
// It used to be a thousand-line page that computed its own numbers from raw
// match history, on its own fixed review intervals -- so it could say 71%
// where Home said 64% for the same topic -- and it still talked about boss
// battles and rematches. It now reads the same snapshot Home, Library and
// Practice read (lib/studySnapshot.ts, lib/mastery.ts), so the four screens
// cannot disagree, and it says in plain words why each number is what it is.

const FILTERS: Array<{ id: "all" | BucketId; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_work", label: "Needs work" },
  { id: "slipping", label: "Slipping" },
  { id: "learning", label: "Learning" },
  { id: "mastered", label: "Mastered" },
];

const CHIP: Record<BucketId, string> = {
  mastered: "chip chip-ok",
  learning: "chip",
  slipping: "chip chip-warn",
  needs_work: "chip chip-bad",
};

const BUCKET_LABEL: Record<BucketId, string> = {
  mastered: "Mastered",
  learning: "Learning",
  slipping: "Slipping",
  needs_work: "Needs work",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Due now", "Back tomorrow", "Back in 5 days". */
function reviewLabel(topic: TopicSummary, now: number): string {
  if (topic.isDue) return "Due now";
  const due = topic.state.dueAtMs;
  if (!due) return "Not scheduled";
  const days = Math.round((due - now) / DAY_MS);
  if (days <= 0) return "Back later today";
  if (days === 1) return "Back tomorrow";
  if (days < 45) return `Back in ${days} days`;
  return `Back in ${Math.round(days / 30)} months`;
}

function TopicRow({ topic, now }: { topic: TopicSummary; now: number }) {
  const bucket = bucketFor(topic);
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--panel-raised)]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
              {topic.topic}
            </p>
            <p className="t-meta mt-0.5 truncate">
              {reviewLabel(topic, now)}
              {topic.confidentMisses > 0
                ? ` · sure but wrong ${topic.confidentMisses === 1 ? "once" : `${topic.confidentMisses} times`}`
                : ""}
            </p>
          </div>
          <div className="hidden w-24 sm:block" aria-hidden="true">
            <div className="meter">
              <span style={{ width: `${Math.min(100, Math.max(2, topic.mastery))}%` }} />
            </div>
          </div>
          <span className="w-10 shrink-0 text-right text-[14px] tabular-nums" style={{ color: "var(--text-2)" }}>
            {topic.mastery}%
          </span>
          <span className={`${CHIP[bucket]} hidden shrink-0 sm:inline-flex`}>{BUCKET_LABEL[bucket]}</span>
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-center">
          <p className="t-body min-w-0 flex-1 text-[14px]">
            {explainMastery(topic.state)} Based on {topic.total} answer{topic.total === 1 ? "" : "s"},{" "}
            {topic.correct} right.
          </p>
          <Link
            href={sessionHref({ deckId: topic.deckId, topics: [topic.topic], mode: "weak_topic", limit: 10 })}
            className="btn btn-secondary btn-sm shrink-0"
          >
            Practice this
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </details>
    </li>
  );
}

export default function MasteryMapPage() {
  const { isReady } = useRequireAuth();
  const { snapshot, isLoading } = useStudy();
  const [filter, setFilter] = useState<"all" | BucketId>("all");
  // One clock reading per render of the list, taken when the snapshot
  // changes rather than on every paint.
  const now = useMemo(() => {
    void snapshot;
    return new Date().getTime();
  }, [snapshot]);

  const breakdown = useMemo(() => progressBreakdown(snapshot.topics), [snapshot.topics]);

  // Grouped by study set, weakest set first, so the page reads top to
  // bottom as "what needs you most".
  const groups = useMemo(() => {
    const visible =
      filter === "all" ? snapshot.topics : snapshot.topics.filter((t) => bucketFor(t) === filter);
    const byDeck = new Map<string, { deckId: string; title: string; topics: TopicSummary[] }>();
    for (const topic of visible) {
      const group = byDeck.get(topic.deckId) || { deckId: topic.deckId, title: topic.deckTitle, topics: [] };
      group.topics.push(topic);
      byDeck.set(topic.deckId, group);
    }
    return Array.from(byDeck.values())
      .map((group) => ({
        ...group,
        topics: group.topics.slice().sort((a, b) => b.priority - a.priority),
        average: Math.round(group.topics.reduce((sum, t) => sum + t.mastery, 0) / group.topics.length),
      }))
      .sort((a, b) => a.average - b.average);
  }, [snapshot.topics, filter]);

  if (!isReady || isLoading) {
    return (
      <div className="app-page app-page-wide" aria-busy="true">
        <div className="skeleton h-9 w-44" />
        <div className="skeleton mt-8 h-[104px] w-full" />
        <div className="skeleton mt-6 h-[280px] w-full" />
      </div>
    );
  }

  return (
    <div className="app-page app-page-wide">
      <Link href="/practice" className="btn btn-quiet btn-sm -ml-3">
        <span aria-hidden="true">←</span> Practice
      </Link>
      <h1 className="t-page mt-3">Mastery map</h1>
      <p className="t-body mt-2 max-w-2xl">
        Every topic you have practiced, how well you know it right now, and
        when it comes back. The numbers come from your answers: how recent they
        were, how hard the questions were, and how much time has passed.
      </p>

      {breakdown.total === 0 ? (
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Nothing on the map yet
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Practice a study set once and every topic in it shows up here, with
            what you know and what to review.
          </p>
          <Link href={snapshot.decks[0] ? `/library/${snapshot.decks[0].id}` : "/home"} className="btn btn-primary mt-6">
            {snapshot.decks[0] ? "Start practicing" : "Add something to study"}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter topics">
            {FILTERS.map((option) => {
              const count =
                option.id === "all"
                  ? breakdown.total
                  : breakdown.buckets.find((b) => b.id === option.id)?.count ?? 0;
              const active = filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(option.id)}
                  disabled={count === 0 && option.id !== "all"}
                  className="btn btn-sm"
                  style={
                    active
                      ? { background: "var(--brand-soft)", color: "var(--brand-text)", borderColor: "var(--brand-line)" }
                      : { background: "var(--panel)", color: "var(--text-2)", borderColor: "var(--line-strong)" }
                  }
                >
                  {option.label}
                  <span className="tabular-nums" style={{ color: "var(--text-3)" }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.deckId} aria-labelledby={`deck-${group.deckId}`}>
                <div className="flex items-baseline justify-between gap-4">
                  <h2 id={`deck-${group.deckId}`} className="t-section">
                    <Link href={`/library/${group.deckId}`} className="hover:underline">
                      {group.title}
                    </Link>
                  </h2>
                  <span className="t-meta">{group.average}% average</span>
                </div>
                <ul className="card mt-3 divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>
                  {group.topics.map((topic) => (
                    <TopicRow key={`${topic.deckId}-${topic.topic}`} topic={topic} now={now} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="t-meta mt-8">
            Tap a topic to see why its number is what it is.{" "}
            <Link href="/vyra" className="underline underline-offset-2">
              Ask Vyra what to focus on
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
