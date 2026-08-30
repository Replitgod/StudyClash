"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { ArrowRightIcon } from "@/app/components/app/Icons";

// Rank.
//
// Rebuilt on the app's design system, and cut down hard. It used to show
// roughly thirty numbers at once: two rank cards with four stat chips each, an
// eight-chip "why your rank is what it is" panel, a five-column subject table
// and THREE stacked seven-column leaderboards. A student could read all of it
// and still not know what to do next -- and a seven-column table is unusable
// on a phone.
//
// What survived is what a student can act on: where you stand, the one line
// explaining why, and one leaderboard at a time behind tabs. The underlying
// API is unchanged; every number here still comes from /api/clashrank.

type RankedEntry = {
  rank: number;
  playerName: string;
  clashRank: string;
  clashScore: number;
  improvementScore: number;
  weaknessCrusherScore: number;
  consistencyScore: number;
  speedImprovementScore: number;
  masteryGrowthScore: number;
  bossWins: number;
  rematchesCompleted: number;
  accuracy: number;
};

type ClassRank = RankedEntry & {
  className: string;
  totalPlayers: number;
};

type SubjectRank = {
  subject: string;
  rank: number;
  clashRank: string;
  clashScore: number;
  totalPlayers: number;
};

type ClashRankPayload = {
  personalRank: RankedEntry | null;
  classRank: ClassRank | null;
  weeklyLeaderboard: RankedEntry[];
  subjectRanks: SubjectRank[];
  improvementLeaderboard: RankedEntry[];
  weaknessCrusherLeaderboard: RankedEntry[];
  generatedAt: string;
};

// Rank tiers, keyed by the labels in lib/ranking.ts. Three steps, not eight
// colours: the lower tiers are neutral, the mid tiers take the brand, and only
// the top two get the "you are improving" green. Previously every tier had its
// own hue (amber/slate/indigo/green), which made the badge read as decoration.
type Tone = "neutral" | "brand" | "ok";
const RANK_TONE: Record<string, Tone> = {
  Bronze: "neutral",
  Silver: "neutral",
  Gold: "brand",
  Platinum: "brand",
  Diamond: "brand",
  Master: "ok",
  Grandmaster: "ok",
  "AceDecks Elite": "ok",
};

function RankBadge({ rank }: { rank: string }) {
  const tone = RANK_TONE[rank] || "neutral";
  const className =
    tone === "ok" ? "chip chip-ok" : tone === "brand" ? "chip chip-brand" : "chip";
  return <span className={className}>{rank}</span>;
}

/** One row of a leaderboard. Four columns, so it fits a phone. */
function LeaderboardRow({
  entry,
  score,
  isYou,
}: {
  entry: RankedEntry;
  score: number;
  isYou: boolean;
}) {
  return (
    <li
      className="flex items-center gap-3 px-4 py-3"
      style={isYou ? { background: "var(--brand-soft)" } : undefined}
    >
      <span
        className="w-7 shrink-0 text-[13px] font-medium tabular-nums"
        style={{ color: "var(--text-3)" }}
      >
        {entry.rank}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[15px]"
        style={{ color: "var(--text-1)", fontWeight: isYou ? 600 : 400 }}
      >
        {entry.playerName}
        {isYou && (
          <span className="t-meta ml-2" style={{ fontWeight: 400 }}>
            you
          </span>
        )}
      </span>
      <span className="hidden sm:block">
        <RankBadge rank={entry.clashRank} />
      </span>
      <span
        className="w-14 shrink-0 text-right text-[15px] font-medium tabular-nums"
        style={{ color: "var(--text-1)" }}
      >
        {score}
      </span>
    </li>
  );
}

const BOARDS = [
  {
    id: "weekly",
    label: "This week",
    blurb: "Highest score over the last seven days.",
    key: "clashScore",
  },
  {
    id: "improvement",
    label: "Most improved",
    blurb: "Biggest gain in understanding, not in volume.",
    key: "improvementScore",
  },
  {
    id: "weakness",
    label: "Weak spots fixed",
    blurb: "Best at turning a weak topic into a strong one.",
    key: "weaknessCrusherScore",
  },
] as const;

type BoardId = (typeof BOARDS)[number]["id"];

export default function ClashRankPage() {
  const { isLoggedIn, isLoading, user, profile } = useAuth();

  const [data, setData] = useState<ClashRankPayload | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardId>("weekly");

  useEffect(() => {
    async function loadClashRank() {
      setIsLoadingData(true);
      setLoadError(null);

      try {
        const response = await authFetch("/api/clashrank", { method: "GET" });
        const payload = (await response.json()) as Partial<ClashRankPayload> & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "We could not load your rank.");
        }

        setData({
          personalRank: payload.personalRank || null,
          classRank: payload.classRank || null,
          weeklyLeaderboard: payload.weeklyLeaderboard || [],
          subjectRanks: payload.subjectRanks || [],
          improvementLeaderboard: payload.improvementLeaderboard || [],
          weaknessCrusherLeaderboard: payload.weaknessCrusherLeaderboard || [],
          generatedAt: payload.generatedAt || new Date().toISOString(),
        });
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "We could not load your rank."
        );
      } finally {
        setIsLoadingData(false);
      }
    }

    if (isLoggedIn) {
      void loadClashRank();
    } else if (!isLoading) {
      setIsLoadingData(false);
    }
  }, [isLoggedIn, isLoading]);

  const personal = data?.personalRank || null;
  const classRank = data?.classRank || null;

  const myName = useMemo(
    () => profile?.display_name?.trim() || user?.email?.split("@")[0] || null,
    [profile?.display_name, user?.email]
  );

  const entries = useMemo(() => {
    if (!data) return [];
    if (board === "improvement") return data.improvementLeaderboard;
    if (board === "weakness") return data.weaknessCrusherLeaderboard;
    return data.weeklyLeaderboard;
  }, [data, board]);

  const activeBoard = BOARDS.find((b) => b.id === board)!;

  if (isLoading || isLoadingData) {
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-32" />
        <div className="skeleton mt-8 h-[150px] w-full" />
        <div className="skeleton mt-6 h-[320px] w-full" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="app-page" style={{ maxWidth: "34rem" }}>
        <h1 className="t-page">Rank</h1>
        <div className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Sign in to see where you stand
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Rank rewards how much you improve, not how much you grind.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <Link href="/login?redirect=/clashrank" className="btn btn-primary">
              Log in
            </Link>
            <Link href="/signup?redirect=/clashrank" className="btn btn-secondary">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <h1 className="t-page">Rank</h1>
      <p className="t-body mt-2 max-w-2xl">
        Built from how much you improve, how consistent you are, and how many
        weak topics you turn around — not from how many matches you play.
      </p>

      {loadError && (
        <div
          className="card mt-6 px-4 py-3"
          role="alert"
          style={{ borderColor: "rgb(255 107 107 / 0.3)", background: "var(--bad-soft)" }}
        >
          <p className="text-[14px]" style={{ color: "var(--text-1)" }}>
            {loadError}
          </p>
        </div>
      )}

      {/* ---- Where you stand ---- */}
      <section className="mt-8">
        {personal ? (
          <div
            className="card p-5 sm:p-6"
            style={{ borderColor: "var(--brand-line)", background: "var(--brand-soft)" }}
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="t-section">Where you stand</p>
                <p
                  className="mt-2 text-[40px] font-semibold leading-none tracking-tight"
                  style={{ color: "var(--text-1)" }}
                >
                  #{personal.rank}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <RankBadge rank={personal.clashRank} />
                  <span className="t-meta">{personal.clashScore} points</span>
                </div>
              </div>

              {classRank && (
                <div className="text-right">
                  <p className="t-section">In {classRank.className}</p>
                  <p
                    className="mt-2 text-[24px] font-semibold leading-none tracking-tight"
                    style={{ color: "var(--text-1)" }}
                  >
                    #{classRank.rank}
                    <span className="t-meta ml-1.5" style={{ fontWeight: 400 }}>
                      of {classRank.totalPlayers}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* The three things actually moving the number, in a sentence
                rather than eight unlabelled chips. */}
            <p className="t-body mt-5">
              You are answering {personal.accuracy}% correctly, and you have
              turned around {personal.rematchesCompleted}{" "}
              {personal.rematchesCompleted === 1 ? "weak topic" : "weak topics"}.
            </p>

            <Link href="/practice" className="btn btn-primary mt-5">
              Fix another weak topic
              <ArrowRightIcon className="h-[18px] w-[18px]" />
            </Link>
          </div>
        ) : (
          <div className="card px-6 py-12 text-center">
            <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
              No rank yet
            </p>
            <p className="t-body mx-auto mt-2 max-w-sm">
              Finish two study sessions and you will have one. Rank is built from
              how much you improve between them.
            </p>
            <Link href="/practice" className="btn btn-primary mt-6">
              Start practising
            </Link>
          </div>
        )}
      </section>

      {/* ---- One leaderboard at a time ---- */}
      <section className="mt-10">
        <h2 className="t-section">Leaderboard</h2>

        <div
          className="mt-3 flex gap-1 rounded-lg p-1"
          role="tablist"
          aria-label="Leaderboard"
          style={{ background: "var(--panel-raised)", width: "fit-content" }}
        >
          {BOARDS.map((b) => {
            const active = b.id === board;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setBoard(b.id)}
                className="rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: active ? "var(--panel-hover)" : "transparent",
                  color: active ? "var(--text-1)" : "var(--text-3)",
                }}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        <p className="t-meta mt-2">{activeBoard.blurb}</p>

        {entries.length === 0 ? (
          <div className="card mt-3 px-6 py-10 text-center">
            <p className="t-body">
              Not enough people have played this week to build this board yet.
            </p>
          </div>
        ) : (
          <ul
            className="card mt-3 divide-y overflow-hidden"
            style={{ borderColor: "var(--line)" }}
          >
            {entries.slice(0, 12).map((entry) => (
              <LeaderboardRow
                key={`${board}-${entry.rank}-${entry.playerName}`}
                entry={entry}
                score={entry[activeBoard.key]}
                isYou={!!myName && entry.playerName === myName}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Per subject, as a list rather than a five-column table ---- */}
      {data?.subjectRanks && data.subjectRanks.length > 0 && (
        <section className="mt-10">
          <h2 className="t-section">By subject</h2>
          <ul
            className="card mt-3 divide-y overflow-hidden"
            style={{ borderColor: "var(--line)" }}
          >
            {data.subjectRanks.map((item) => (
              <li key={item.subject} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="min-w-0 flex-1 truncate text-[15px]"
                  style={{ color: "var(--text-1)" }}
                >
                  {item.subject}
                </span>
                <RankBadge rank={item.clashRank} />
                <span
                  className="shrink-0 text-[14px] tabular-nums"
                  style={{ color: "var(--text-2)" }}
                >
                  #{item.rank}
                  <span className="t-meta"> of {item.totalPlayers}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data?.generatedAt && (
        <p className="t-meta mt-8">
          Updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
