import { describe, expect, it } from "vitest";
import {
  canSendRequest,
  friendshipKey,
  isSearchableHandle,
  normaliseHandle,
} from "@/lib/friends";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

describe("friendshipKey", () => {
  it("orders the pair the same way regardless of argument order", () => {
    // The whole point: one row per friendship, so it cannot exist in one
    // direction only.
    expect(friendshipKey(A, B)).toEqual(friendshipKey(B, A));
    expect(friendshipKey(A, B)).toEqual({ userLow: A, userHigh: B });
  });

  it("refuses a self-friendship and missing ids", () => {
    expect(friendshipKey(A, A)).toBeNull();
    expect(friendshipKey("", B)).toBeNull();
    expect(friendshipKey(A, "")).toBeNull();
  });
});

describe("canSendRequest", () => {
  const base = {
    fromUserId: A,
    toUserId: B,
    alreadyFriends: false,
    outgoingPending: false,
    incomingPending: false,
  };

  it("allows a first request", () => {
    expect(canSendRequest(base)).toEqual({ ok: true });
  });

  it("refuses adding yourself", () => {
    expect(canSendRequest({ ...base, toUserId: A }).ok).toBe(false);
  });

  it("refuses when already friends", () => {
    expect(canSendRequest({ ...base, alreadyFriends: true }).ok).toBe(false);
  });

  it("refuses a duplicate outgoing request", () => {
    const result = canSendRequest({ ...base, outgoingPending: true });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/already sent/i);
  });

  it("accepts their request instead of creating a crossing one", () => {
    // Otherwise both sides sit waiting on each other forever.
    const result = canSendRequest({ ...base, incomingPending: true });
    expect(result.ok).toBe(true);
    expect(result.shouldAcceptInstead).toBe(true);
  });

  it("treats already-friends as decisive even with a stale pending row", () => {
    const result = canSendRequest({
      ...base,
      alreadyFriends: true,
      incomingPending: true,
    });
    expect(result.ok).toBe(false);
  });
});

describe("handles", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(normaliseHandle("  Maya.Chen  ")).toBe("maya.chen");
  });

  it("bounds the length", () => {
    expect(normaliseHandle("x".repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it("will not look up a fragment", () => {
    // Prefix search over a product used by minors is a directory of
    // children. You can find a handle you know; you cannot browse.
    expect(isSearchableHandle("a")).toBe(false);
    expect(isSearchableHandle("ab")).toBe(false);
    expect(isSearchableHandle("   ")).toBe(false);
    expect(isSearchableHandle("maya.chen")).toBe(true);
  });
});
