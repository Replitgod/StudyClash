// Pure logic for the friend graph.
//
// A friendship is stored once, not twice, with the smaller user id first.
// Two rows per friendship is exactly how "A is friends with B but B is not
// friends with A" bugs happen, and they are miserable to find because every
// screen looks right from one side.
//
// Search deliberately requires an exact handle rather than matching
// prefixes. This product is used by minors (section 32), and a search that
// returns "everyone whose name starts with A" is a directory of children.
// You can find someone you already know the handle of; you cannot browse.

export type FriendPair = { userLow: string; userHigh: string };

/** Canonical storage order for a friendship. */
export function friendshipKey(a: string, b: string): FriendPair | null {
  if (!a || !b || a === b) return null;
  return a < b ? { userLow: a, userHigh: b } : { userLow: b, userHigh: a };
}

export type FriendRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export type RequestDecision =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether a friend request is allowed right now.
 *
 * The interesting case is the third one: if B already has a pending request
 * out to A, A "sending" one back should accept theirs rather than creating
 * a second crossing request that leaves both sides waiting on each other.
 */
export function canSendRequest(args: {
  fromUserId: string;
  toUserId: string;
  alreadyFriends: boolean;
  outgoingPending: boolean;
  incomingPending: boolean;
}): RequestDecision & { shouldAcceptInstead?: boolean } {
  if (!args.toUserId || args.fromUserId === args.toUserId) {
    return { ok: false, reason: "You cannot add yourself." };
  }
  if (args.alreadyFriends) {
    return { ok: false, reason: "You are already friends." };
  }
  if (args.incomingPending) {
    return { ok: true, shouldAcceptInstead: true };
  }
  if (args.outgoingPending) {
    return { ok: false, reason: "Request already sent." };
  }
  return { ok: true };
}

/**
 * Normalises a handle for lookup.
 *
 * Case and surrounding whitespace are ignored so a handle copied out of a
 * message still matches, but nothing else is loosened -- the match itself
 * stays exact.
 */
export function normaliseHandle(raw: string): string {
  return (raw || "").trim().toLowerCase().slice(0, 120);
}

/** True when the input looks like a whole handle worth looking up. */
export function isSearchableHandle(raw: string): boolean {
  const handle = normaliseHandle(raw);
  // Two characters is not a handle, it is a fishing expedition.
  return handle.length >= 3;
}
