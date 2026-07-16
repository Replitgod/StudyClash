"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Button } from "@/app/components/ui/Button";

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

type PersonalRank = RankedEntry;

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
  personalRank: PersonalRank | null;
  classRank: ClassRank | null;
  weeklyLeaderboard: RankedEntry[];
  subjectRanks: SubjectRank[];
  improvementLeaderboard: RankedEntry[];
  weaknessCrusherLeaderboard: RankedEntry[];
  generatedAt: string;
};

const RANK_COLORS: Record<string, string> = {
  Bronze: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  Silver: "text-slate-200 border-slate-400/30 bg-slate-400/10",
  Gold: "text-amber-300 border-amber-400/30 bg-amber-500/10",
  Platinum: "text-indigo-200 border-indigo-400/30 bg-indigo-500/10",
  Diamond: "text-indigo-200 border-indigo-400/30 bg-indigo-500/10",
  Champion: "text-indigo-200 border-indigo-400/30 bg-indigo-500/10",
  Legend: "text-green-200 border-green-400/30 bg-green-500/10",
};

function rankStyle(rank: string): string {
  return RANK_COLORS[rank] || "text-white border-white/20 bg-white/10";
}

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[420px] w-[420px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[460px] w-[460px] rounded-full bg-green-500/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pt-10 sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

function ScoreChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function LeaderboardTable({
  title,
  subtitle,
  entries,
  scoreKey,
}: {
  title: string;
  subtitle: string;
  entries: RankedEntry[];
  scoreKey: "clashScore" | "improvementScore" | "weaknessCrusherScore";
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-black text-white">{title}</h3>
          <p className="text-xs text-white/50">{subtitle}</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/55">
          Not enough data yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-white/45">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Player</th>
                <th className="pb-2 pr-4">Rank</th>
                <th className="pb-2 pr-4">Score</th>
                <th className="pb-2 pr-4">Accuracy</th>
                <th className="pb-2 pr-4">Boss Wins</th>
                <th className="pb-2">Rematches</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 12).map((entry) => (
                <tr key={`${title}-${entry.rank}-${entry.playerName}`} className="border-t border-white/10">
                  <td className="py-2 pr-4 font-bold text-indigo-200">{entry.rank}</td>
                  <td className="py-2 pr-4 text-white/90">{entry.playerName}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${rankStyle(entry.clashRank)}`}>
                      {entry.clashRank}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-bold text-white">{entry[scoreKey]}</td>
                  <td className="py-2 pr-4 text-white/80">{entry.accuracy}%</td>
                  <td className="py-2 pr-4 text-white/80">{entry.bossWins}</td>
                  <td className="py-2 text-white/80">{entry.rematchesCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ClashRankPage() {
  const { isLoggedIn, isLoading } = useAuth();

  const [data, setData] = useState<ClashRankPayload | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadClashRank() {
      setIsLoadingData(true);
      setLoadError(null);

      try {
        const response = await authFetch("/api/clashrank", { method: "GET" });
        const payload = (await response.json()) as Partial<ClashRankPayload> & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load ClashRank.");
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
        setLoadError(error instanceof Error ? error.message : "Failed to load ClashRank.");
      } finally {
        setIsLoadingData(false);
      }
    }

    if (isLoggedIn) {
      void loadClashRank();
    } else if (!isLoading) {
      void Promise.resolve().then(() => setIsLoadingData(false));
    }
  }, [isLoggedIn, isLoading]);

  const personal = data?.personalRank || null;
  const classRank = data?.classRank || null;

  const scoreFactors = useMemo(() => {
    if (!personal) return null;

    return [
      { label: "Accuracy", value: `${personal.accuracy}%` },
      { label: "Improvement", value: personal.improvementScore },
      { label: "Consistency", value: personal.consistencyScore },
      { label: "Speed Improvement", value: personal.speedImprovementScore },
      { label: "Mastery Growth", value: personal.masteryGrowthScore },
      { label: "Weakness Crusher", value: personal.weaknessCrusherScore },
      { label: "Boss Wins", value: personal.bossWins },
      { label: "Weak Rematches", value: personal.rematchesCompleted },
    ];
  }, [personal]);

  if (isLoading || isLoadingData) {
    return (
      <Background>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <svg className="h-10 w-10 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="mt-4 text-sm text-white/55">Calculating ClashRank...</p>
        </div>
      </Background>
    );
  }

  if (!isLoggedIn) {
    return (
      <Background>
        <div className="mx-auto flex min-h-[65vh] w-full max-w-md items-center justify-center">
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:p-8">
            <h1 className="text-xl font-bold text-white">Sign in to view ClashRank</h1>
            <p className="mt-2 text-sm text-white/55">
              ClashRank rewards learning progress, not pure grinding.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <Button href="/login?redirect=/clashrank" variant="secondary">
                Log In
              </Button>
              <Button href="/signup?redirect=/clashrank" variant="ghost">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </Background>
    );
  }

  return (
    <Background>
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-indigo-300">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                CLASHRANK
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                <span className="bg-gradient-to-r from-amber-300 via-indigo-300 to-indigo-300 bg-clip-text text-transparent">
                  Rank By Improvement
                </span>
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-white/60 sm:text-base">
                ClashRank weights improvement, consistency, weak-topic recovery, mastery growth, and speed gains above pure match volume.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/85">
                Dashboard
              </Link>
              <Link href="/mastery-map" className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-2.5 text-sm font-bold text-indigo-100">
                Mastery Map
              </Link>
            </div>
          </div>
        </section>

        {loadError && (
          <section className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            {loadError}
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/45">Personal Rank</p>
            {personal ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-3xl font-black text-white">#{personal.rank}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${rankStyle(personal.clashRank)}`}>
                    {personal.clashRank}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/65">ClashScore {personal.clashScore}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ScoreChip label="Accuracy" value={`${personal.accuracy}%`} />
                  <ScoreChip label="Improvement" value={personal.improvementScore} />
                  <ScoreChip label="Consistency" value={personal.consistencyScore} />
                  <ScoreChip label="Speed Gain" value={personal.speedImprovementScore} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/55">Need at least 2 matches to compute rank.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/45">Class Rank</p>
            {classRank ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-3xl font-black text-white">#{classRank.rank}</span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${rankStyle(classRank.clashRank)}`}>
                    {classRank.clashRank}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/65">
                  {classRank.className} · {classRank.totalPlayers} players
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ScoreChip label="Class ClashScore" value={classRank.clashScore} />
                  <ScoreChip label="Weakness Crusher" value={classRank.weaknessCrusherScore} />
                  <ScoreChip label="Boss Wins" value={classRank.bossWins} />
                  <ScoreChip label="Rematches" value={classRank.rematchesCompleted} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-white/55">Not enough class data yet.</p>
            )}
          </div>
        </section>

        {scoreFactors && (
          <section className="rounded-2xl border border-indigo-400/20 bg-indigo-500/[0.06] p-4 backdrop-blur-sm sm:p-5">
            <h2 className="text-lg font-black text-white">Why your rank is what it is</h2>
            <p className="mt-1 text-sm text-white/65">
              Grinding alone does not dominate ClashRank. Your gains in understanding and consistency matter more.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {scoreFactors.map((item) => (
                <ScoreChip key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5">
          <h2 className="text-lg font-black text-white">Subject-specific rank</h2>
          {data?.subjectRanks && data.subjectRanks.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-white/45">
                    <th className="pb-2 pr-4">Subject</th>
                    <th className="pb-2 pr-4">Rank</th>
                    <th className="pb-2 pr-4">ClashRank</th>
                    <th className="pb-2 pr-4">ClashScore</th>
                    <th className="pb-2">Players</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjectRanks.map((item) => (
                    <tr key={item.subject} className="border-t border-white/10">
                      <td className="py-2 pr-4 text-white/90">{item.subject}</td>
                      <td className="py-2 pr-4 font-bold text-indigo-200">#{item.rank}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${rankStyle(item.clashRank)}`}>
                          {item.clashRank}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-bold text-white">{item.clashScore}</td>
                      <td className="py-2 text-white/80">{item.totalPlayers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/55">No subject rankings yet.</p>
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <LeaderboardTable
            title="Weekly Leaderboard"
            subtitle="Top ClashRank performers in the last 7 days"
            entries={data?.weeklyLeaderboard || []}
            scoreKey="clashScore"
          />
          <LeaderboardTable
            title="Improvement Leaderboard"
            subtitle="Most learning growth over recent attempts"
            entries={data?.improvementLeaderboard || []}
            scoreKey="improvementScore"
          />
          <LeaderboardTable
            title="Weakness Crusher Leaderboard"
            subtitle="Best at converting weak topics into strengths"
            entries={data?.weaknessCrusherLeaderboard || []}
            scoreKey="weaknessCrusherScore"
          />
        </div>

        <p className="text-xs text-white/40">
          Updated: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "N/A"}
        </p>
      </div>
    </Background>
  );
}
