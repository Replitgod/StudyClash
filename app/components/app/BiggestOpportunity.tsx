"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { sessionHref } from "@/lib/nextAction";
import { findOpportunities, type MistakeRecord, type Opportunity } from "@/lib/weakness";
import type { TopicSummary } from "@/lib/studySnapshot";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// "Your biggest opportunity", with what specifically keeps going wrong.
//
// The point of this is the second half. A student told "Radical Equations,
// 51%" knows where the problem is but not what it is, so their only option
// is to re-practise everything and hope. Naming the recurring sub-skills --
// extraneous solutions, domain restrictions -- turns a score into something
// they can act on.
//
// One button, and clicking it starts the repair session immediately: no
// setup, no menus, no configuration.

/**
 * Loads the recorded mistake patterns and ranks what is worth fixing.
 *
 * Returns null while loading so a caller can hold the whole section back
 * rather than showing a card that pops its detail in a moment later.
 */
export function useOpportunities(
  topics: TopicSummary[],
  limit = 4
): Opportunity[] | null {
  const [mistakes, setMistakes] = useState<MistakeRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    authFetch("/api/weakness")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setMistakes(Array.isArray(data?.mistakes) ? data.mistakes : []);
      })
      .catch(() => {
        // Degrade to the topic-level view: still useful, just without the
        // sub-skill breakdown.
        if (!cancelled) setMistakes([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (mistakes === null) return null;
  return findOpportunities({ topics, mistakes, limit });
}

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const href = sessionHref({
    deckId: opportunity.deckId,
    topics: [opportunity.topic],
    mode: "weak_topic",
    limit: 10,
  });

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
          {opportunity.topic}
        </p>
        <p className="t-meta tabular-nums">
          {opportunity.mastery}% · {opportunity.deckTitle}
        </p>
      </div>

      <p className="t-body mt-1.5">{opportunity.reason}</p>

      {opportunity.patterns.length > 0 && (
        <div className="mt-4">
          <p className="t-meta">You keep missing questions involving:</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {opportunity.patterns.map((pattern) => (
              <li
                key={pattern.label}
                className="flex items-baseline gap-2.5 text-[14px]"
                style={{ color: "var(--text-2)" }}
              >
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                  style={{ background: "var(--text-4)" }}
                />
                <span className="min-w-0 flex-1">{pattern.label}</span>
                {pattern.count > 1 && (
                  <span className="t-meta shrink-0 tabular-nums">{pattern.count}×</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={href} className="btn btn-primary">
          Fix this
          <ArrowRightIcon className="h-[18px] w-[18px]" />
        </Link>
        <span className="t-meta">about {opportunity.minutes} min</span>
      </div>
    </div>
  );
}
