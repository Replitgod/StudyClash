"use client";

import Link from "next/link";
import type { ProgressSnapshot } from "@/lib/useProgress";

// Level, streak and today's quests.
//
// Placed below the primary action on Home, never above it. Home's job is to
// answer "what should I study right now"; this answers "how am I doing",
// which is a real question but a second one. Putting a stat grid at the top
// is how every screen ends up looking equally important, which reads the
// same as nothing being important.
//
// Everything shown here is read from the database. There is no placeholder
// streak and no sample quest -- if a student has done nothing, this renders
// nothing rather than a decorative zero.

function StreakFlame({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5s3.5 3 3.5 6a3.5 3.5 0 0 1-7 0c0-1 .5-2 .5-2S4 7 4 8.5a4 4 0 1 0 8 0c0-3.5-4-7-4-7Z" />
    </svg>
  );
}

export function ProgressSummary({ progress }: { progress: ProgressSnapshot }) {
  const { level, streak, quests } = progress;
  const openQuests = quests.filter((quest) => !quest.isComplete);
  const doneCount = quests.length - openQuests.length;

  // Nothing earned yet and nothing to do: say nothing. An empty progression
  // panel on a new account is pure noise.
  const hasAnything = progress.xp > 0 || streak.current > 0 || quests.length > 0;
  if (!hasAnything) return null;

  return (
    <section className="mt-10 rise">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-section">Your progress</h2>
        {streak.current > 0 && (
          <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums"
            style={{ color: "var(--warn)" }}
            title={
              streak.freezes > 0
                ? `${streak.freezes} streak freeze${streak.freezes === 1 ? "" : "s"} saved — one missed day is covered`
                : undefined
            }
          >
            <StreakFlame className="h-3.5 w-3.5" />
            {streak.current} day{streak.current === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="card mt-3 p-4 sm:p-5">
        {/* ---- Level ---- */}
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            Level {level.level}
          </p>
          <p className="t-meta tabular-nums">
            {level.xpToNextLevel.toLocaleString()} XP to level {level.level + 1}
          </p>
        </div>
        <div
          className="meter mt-2.5"
          role="progressbar"
          aria-valuenow={level.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Level ${level.level} progress`}
        >
          <span style={{ width: `${Math.max(2, level.percent)}%` }} />
        </div>

        {/* ---- Today's quests ---- */}
        {quests.length > 0 && (
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <div className="flex items-baseline justify-between gap-4">
              <p className="t-section" style={{ fontSize: "0.6875rem" }}>
                Today
              </p>
              <p className="t-meta tabular-nums">
                {doneCount} / {quests.length} done
              </p>
            </div>

            <ul className="mt-3 flex flex-col gap-2.5">
              {quests.map((quest) => (
                <li key={quest.key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p
                        className="truncate text-[14px]"
                        style={{
                          color: quest.isComplete ? "var(--text-3)" : "var(--text-1)",
                          textDecoration: quest.isComplete ? "line-through" : undefined,
                        }}
                      >
                        {quest.description}
                      </p>
                      <span className="t-meta shrink-0 tabular-nums">
                        {quest.progress}/{quest.target}
                      </span>
                    </div>
                    <div
                      className="meter mt-1.5"
                      style={{ height: 4 }}
                      role="progressbar"
                      aria-valuenow={quest.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={quest.description}
                    >
                      <span
                        style={{
                          width: `${Math.max(2, quest.percent)}%`,
                          background: quest.isComplete ? "var(--ok)" : "var(--brand)",
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- Rank, only once there is one ---- */}
        {progress.ratings.length > 0 && (
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {progress.ratings.slice(0, 3).map((rating) => (
                <Link
                  key={rating.subject}
                  href="/clashrank"
                  className="chip chip-brand"
                  title={`${rating.rating} rating${
                    rating.winRate !== null ? ` · ${rating.winRate}% win rate` : ""
                  }`}
                >
                  {rating.subject === "overall" ? "" : `${rating.subject} · `}
                  {rating.rank.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
