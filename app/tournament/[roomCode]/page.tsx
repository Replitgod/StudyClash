"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { FLOATING_ACTION } from "@/lib/uiLayout";

type BracketPlayer = { userId: string; name: string } | null;

type BracketMatch = {
  id: string;
  round: number;
  slot: number;
  playerA: BracketPlayer;
  playerB: BracketPlayer;
  playerAScore: number | null;
  playerBScore: number | null;
  winner: BracketPlayer;
  status: "pending" | "complete" | "bye";
};

type TournamentState = {
  room: { id: string; roomCode: string; title: string; ownerUserId: string };
  deck: { id: string; title: string; courseName: string } | null;
  members: Array<{ userId: string; name: string; joinedAt: string }>;
  started: boolean;
  matches: BracketMatch[];
  champion: BracketPlayer;
};

// Refetching also re-runs lazy bracket resolution server-side (see
// /api/classroom/tournament/[roomCode]) -- there's no live/websocket layer
// in this app, so polling is how students see the bracket advance without
// a manual refresh.
const POLL_INTERVAL_MS = 20_000;

function Background({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-10 sm:px-6 sm:pt-16 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {children}
      </div>
    </main>
  );
}

function MatchCard({
  match,
  currentUserId,
  deckId,
}: {
  match: BracketMatch;
  currentUserId: string | null;
  deckId: string | null;
}) {
  const isInvolved =
    currentUserId &&
    (match.playerA?.userId === currentUserId || match.playerB?.userId === currentUserId);

  return (
    <div
      className={`rounded-xl border p-3.5 text-sm ${
        match.status === "complete"
          ? "border-emerald-400/25 bg-emerald-500/[0.04]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {[match.playerA, match.playerB].map((player, i) => {
        const score = i === 0 ? match.playerAScore : match.playerBScore;
        const isWinner = match.winner && player?.userId === match.winner.userId;
        return (
          <div
            key={i}
            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${
              isWinner ? "bg-emerald-500/10" : ""
            }`}
          >
            <span
              className={`truncate font-semibold ${
                isWinner ? "text-emerald-200" : "text-white/80"
              }`}
            >
              {player?.name || (match.status === "bye" ? "—" : "TBD")}
            </span>
            <span className="flex-shrink-0 text-xs text-white/50">
              {typeof score === "number" ? score : ""}
              {isWinner && " 🏆"}
            </span>
          </div>
        );
      })}

      {match.status === "bye" && (
        <p className="mt-1.5 text-[11px] text-white/40">Bye — advances automatically</p>
      )}
      {match.status === "pending" && (
        <p className="mt-1.5 text-[11px] text-white/40">Waiting for both players to battle</p>
      )}
      {isInvolved && match.status === "pending" && deckId && (
        <Link
          href={`/battle/${deckId}`}
          className="mt-2 block rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-600 px-3 py-2 text-center text-xs font-bold text-white"
        >
          Play Your Match
        </Link>
      )}
    </div>
  );
}

export default function TournamentPage() {
  const params = useParams();
  const roomCode = String(params.roomCode || "").toUpperCase();
  const { user, isLoggedIn } = useAuth();

  const [state, setState] = useState<TournamentState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Bumped after a successful "Start Tournament" to trigger an immediate
  // refetch, without calling the effect's fetch logic from outside it.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!roomCode) return;

    let cancelled = false;

    async function loadTournament() {
      try {
        const response = await fetch(`/api/classroom/tournament/${roomCode}`);
        const data = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setLoadError(data.error || "Could not load this tournament.");
          return;
        }

        setState(data as TournamentState);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load this tournament."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadTournament();
    const interval = setInterval(loadTournament, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomCode, refreshKey]);

  const handleStart = async () => {
    setIsStarting(true);
    setStartError(null);

    try {
      const response = await authFetch("/api/classroom/tournament/start", {
        method: "POST",
        body: JSON.stringify({ roomCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStartError(data.error || "Could not start the tournament.");
        return;
      }

      setRefreshKey((key) => key + 1);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "Could not start the tournament.");
    } finally {
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <Background>
        <p className="text-sm text-white/50">Loading tournament...</p>
      </Background>
    );
  }

  if (loadError || !state) {
    return (
      <Background>
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-200">
          {loadError || "This tournament could not be found."}
        </div>
      </Background>
    );
  }

  const isOwner = isLoggedIn && user?.id === state.room.ownerUserId;
  const roundsByNumber = new Map<number, BracketMatch[]>();
  for (const match of state.matches) {
    const list = roundsByNumber.get(match.round) || [];
    list.push(match);
    roundsByNumber.set(match.round, list);
  }
  const roundNumbers = Array.from(roundsByNumber.keys()).sort((a, b) => a - b);

  return (
    <Background>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
          Tournament Bracket
        </p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
          {state.room.title}
        </h1>
        {state.deck && (
          <p className="mt-1 text-sm text-white/60">
            {state.deck.title} · {state.deck.courseName}
          </p>
        )}
        <p className="mt-1 text-xs font-bold tracking-[0.16em] text-amber-200">
          CODE: {state.room.roomCode}
        </p>

        {state.champion && (
          <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-200">Champion</p>
            <p className="mt-1 text-xl font-black text-white">🏆 {state.champion.name}</p>
          </div>
        )}

        {!state.started ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-white/50">
              Registered Players ({state.members.length})
            </p>
            {state.members.length === 0 ? (
              <p className="mt-2 text-sm text-white/50">
                No one has joined yet. Share the room code above.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {state.members.map((member) => (
                  <li
                    key={member.userId}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                  >
                    {member.name}
                  </li>
                ))}
              </ul>
            )}

            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={isStarting || state.members.length < 2}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isStarting
                    ? "Starting..."
                    : state.members.length < 2
                      ? "Need at least 2 players"
                      : "Start Tournament"}
                </button>
                {startError && <p className="mt-2 text-xs text-red-300">{startError}</p>}
              </>
            )}
          </div>
        ) : (
          <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
            {roundNumbers.map((roundNumber) => (
              <div key={roundNumber} className="flex w-64 flex-shrink-0 flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-wider text-white/50">
                  {roundNumber === roundNumbers[roundNumbers.length - 1] && state.champion
                    ? "Final"
                    : `Round ${roundNumber}`}
                </p>
                {(roundsByNumber.get(roundNumber) || [])
                  .sort((a, b) => a.slot - b.slot)
                  .map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      currentUserId={user?.id || null}
                      deckId={state.deck?.id || null}
                    />
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Background>
  );
}
