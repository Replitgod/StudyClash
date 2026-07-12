// Shared single-elimination bracket-pairing logic used by both
// /api/classroom/tournament/start (round 1, from registered members) and
// /api/classroom/tournament/[roomCode] (later rounds, from the previous
// round's winners in bracket order).

export type BracketPlayer = {
  userId: string;
  name: string;
};

export function shufflePlayers<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export type BracketPairing = {
  slot: number;
  playerA: BracketPlayer;
  // null means playerA gets a bye (odd player count) and auto-advances.
  playerB: BracketPlayer | null;
};

export function pairPlayersForRound(players: BracketPlayer[]): BracketPairing[] {
  const pairings: BracketPairing[] = [];
  let slot = 0;

  for (let i = 0; i < players.length; i += 2) {
    pairings.push({
      slot,
      playerA: players[i],
      playerB: players[i + 1] || null,
    });
    slot += 1;
  }

  return pairings;
}
