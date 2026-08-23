import { NextRequest, NextResponse } from "next/server";
import {
  getServiceSupabaseClient,
  requireAuthenticatedUser,
} from "@/lib/server/apiUtils";
import { checkDistributedRateLimit } from "@/lib/server/rateLimit";
import {
  canSendRequest,
  friendshipKey,
  isSearchableHandle,
  normaliseHandle,
} from "@/lib/friends";
import { rankForRating } from "@/lib/ranking";

export const runtime = "nodejs";

// The friend graph: who you are friends with, who is waiting on you, and
// looking someone up by handle.
//
// Safety shapes this route more than anything else (section 32). It is an
// education product used by minors, so:
//
//   - search requires a whole handle, never a prefix. You can find someone
//     whose handle you already know; you cannot enumerate the user table.
//   - a lookup returns a display name and rank and nothing else. No email,
//     no id that was not already implied, nothing about what they study.
//   - a miss and a hit take the same shape, so this cannot be used to
//     confirm whether a particular person has an account.
//
// Writes are service-role because friendships live in a table the browser
// cannot write; every one is scoped to the caller's own id.

type FriendRow = { user_low: string; user_high: string };

async function loadGraph(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  userId: string
) {
  const [friendsResult, requestsResult] = await Promise.all([
    supabase
      .from("friendships")
      .select("user_low, user_high, created_at")
      .or(`user_low.eq.${userId},user_high.eq.${userId}`),
    supabase
      .from("friend_requests")
      .select("id, from_user_id, to_user_id, status, created_at")
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .eq("status", "pending"),
  ]);

  const friendIds = (friendsResult.data || []).map((row: FriendRow) =>
    row.user_low === userId ? row.user_high : row.user_low
  );

  return {
    friendIds,
    requests: requestsResult.data || [],
  };
}

/** Display names and ranks for a set of users. Nothing else leaves here. */
async function loadPublicProfiles(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  ids: string[]
) {
  if (ids.length === 0) return new Map<string, { name: string; rank: string | null }>();

  const [profilesResult, ratingsResult] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", ids),
    supabase.from("player_ratings").select("user_id, rating").in("user_id", ids),
  ]);

  const bestRating = new Map<string, number>();
  for (const row of (ratingsResult.data || []) as Array<{
    user_id: string;
    rating: number;
  }>) {
    const current = bestRating.get(row.user_id) ?? 0;
    if (row.rating > current) bestRating.set(row.user_id, row.rating);
  }

  const map = new Map<string, { name: string; rank: string | null }>();
  for (const row of (profilesResult.data || []) as Array<{
    id: string;
    display_name: string | null;
  }>) {
    const rating = bestRating.get(row.id);
    map.set(row.id, {
      name: (row.display_name || "").trim() || "Student",
      rank: rating ? rankForRating(rating).name : null,
    });
  }
  return map;
}

export async function GET(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabaseClient();

  try {
    const query = req.nextUrl.searchParams.get("q");

    // --- Lookup by handle -------------------------------------------------
    if (query !== null) {
      if (!isSearchableHandle(query)) {
        return NextResponse.json({ results: [] });
      }

      const handle = normaliseHandle(query);
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        // Exact match only, case-insensitive. `ilike` with no wildcards is
        // an equality test -- adding a `%` here would turn this into the
        // enumerable directory the whole design avoids.
        .ilike("display_name", handle)
        .limit(5);

      const results = (data || [])
        .filter((row: { id: string }) => row.id !== userId)
        .map((row: { id: string; display_name: string | null }) => ({
          id: row.id,
          name: (row.display_name || "").trim() || "Student",
        }));

      return NextResponse.json({ results });
    }

    // --- The graph --------------------------------------------------------
    const { friendIds, requests } = await loadGraph(supabase, userId);

    const involvedIds = Array.from(
      new Set([
        ...friendIds,
        ...requests.map((r: { from_user_id: string; to_user_id: string }) =>
          r.from_user_id === userId ? r.to_user_id : r.from_user_id
        ),
      ])
    );

    const profiles = await loadPublicProfiles(supabase, involvedIds);

    return NextResponse.json({
      friends: friendIds.map((id) => ({
        id,
        name: profiles.get(id)?.name || "Student",
        rank: profiles.get(id)?.rank || null,
      })),
      incoming: requests
        .filter((r: { to_user_id: string }) => r.to_user_id === userId)
        .map((r: { id: string; from_user_id: string }) => ({
          id: r.id,
          userId: r.from_user_id,
          name: profiles.get(r.from_user_id)?.name || "Student",
        })),
      outgoing: requests
        .filter((r: { from_user_id: string }) => r.from_user_id === userId)
        .map((r: { id: string; to_user_id: string }) => ({
          id: r.id,
          userId: r.to_user_id,
          name: profiles.get(r.to_user_id)?.name || "Student",
        })),
    });
  } catch {
    // Tables may not be deployed yet. An empty graph keeps the page usable.
    return NextResponse.json({ friends: [], incoming: [], outgoing: [] });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await requireAuthenticatedUser(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Friend requests are the classic vector for harassment at volume, so
  // this is rate limited well below anything a real person would hit.
  const limit = await checkDistributedRateLimit({
    key: `friends:${userId}`,
    limit: 20,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  const supabase = getServiceSupabaseClient();

  try {
    /* --- Send ------------------------------------------------------------ */
    if (action === "request") {
      const targetId = typeof body?.userId === "string" ? body.userId : "";
      const { friendIds, requests } = await loadGraph(supabase, userId);

      const decision = canSendRequest({
        fromUserId: userId,
        toUserId: targetId,
        alreadyFriends: friendIds.includes(targetId),
        outgoingPending: requests.some(
          (r: { from_user_id: string; to_user_id: string }) =>
            r.from_user_id === userId && r.to_user_id === targetId
        ),
        incomingPending: requests.some(
          (r: { from_user_id: string; to_user_id: string }) =>
            r.from_user_id === targetId && r.to_user_id === userId
        ),
      });

      if (!decision.ok) {
        return NextResponse.json({ error: decision.reason }, { status: 400 });
      }

      // They already asked us. Accept theirs rather than leaving two
      // crossing requests with both sides waiting on the other.
      if (decision.shouldAcceptInstead) {
        const incoming = requests.find(
          (r: { from_user_id: string; to_user_id: string }) =>
            r.from_user_id === targetId && r.to_user_id === userId
        ) as { id: string } | undefined;

        if (incoming) {
          return acceptRequest(supabase, userId, incoming.id);
        }
      }

      const { error } = await supabase.from("friend_requests").insert({
        from_user_id: userId,
        to_user_id: targetId,
        status: "pending",
      });

      if (error) throw error;
      return NextResponse.json({ ok: true, status: "pending" });
    }

    /* --- Accept / decline ------------------------------------------------ */
    if (action === "accept" || action === "decline") {
      const requestId = typeof body?.requestId === "string" ? body.requestId : "";
      if (!requestId) {
        return NextResponse.json({ error: "Missing request." }, { status: 400 });
      }

      if (action === "accept") return acceptRequest(supabase, userId, requestId);

      // Only the recipient may decline, which the eq() below enforces --
      // a request id alone must not be enough to act on someone else's row.
      await supabase
        .from("friend_requests")
        .update({ status: "declined", responded_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("to_user_id", userId);

      return NextResponse.json({ ok: true, status: "declined" });
    }

    /* --- Remove ---------------------------------------------------------- */
    if (action === "remove") {
      const targetId = typeof body?.userId === "string" ? body.userId : "";
      const pair = friendshipKey(userId, targetId);
      if (!pair) {
        return NextResponse.json({ error: "Unknown friend." }, { status: 400 });
      }

      await supabase
        .from("friendships")
        .delete()
        .eq("user_low", pair.userLow)
        .eq("user_high", pair.userHigh);

      return NextResponse.json({ ok: true, status: "removed" });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error(
      "Friend action failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "That did not work. Please try again." }, { status: 500 });
  }
}

async function acceptRequest(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  userId: string,
  requestId: string
) {
  // Scoped to the recipient: holding a request id must not let anyone
  // accept a request that was not sent to them.
  const { data: request } = await supabase
    .from("friend_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("id", requestId)
    .eq("to_user_id", userId)
    .maybeSingle();

  if (!request || request.status !== "pending") {
    return NextResponse.json({ error: "That request is no longer open." }, { status: 404 });
  }

  const pair = friendshipKey(request.from_user_id, request.to_user_id);
  if (!pair) {
    return NextResponse.json({ error: "That request is not valid." }, { status: 400 });
  }

  // Upsert, not insert: accepting twice must not fail on the primary key.
  await supabase
    .from("friendships")
    .upsert(
      { user_low: pair.userLow, user_high: pair.userHigh },
      { onConflict: "user_low,user_high", ignoreDuplicates: true }
    );

  await supabase
    .from("friend_requests")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", requestId);

  return NextResponse.json({ ok: true, status: "accepted" });
}
