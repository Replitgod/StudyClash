"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { isSearchableHandle } from "@/lib/friends";

// Friends.
//
// Reached from Practice and Settings rather than getting its own navigation
// item: the app has four destinations and adding a fifth for something a
// student visits occasionally is how a sidebar becomes a menu.
//
// The empty state matters more here than anywhere else in the app, because
// on a new account it is the *only* state. It has to explain what friends
// are for and give one thing to do, rather than saying "no friends yet".

type Person = { id: string; name: string; rank?: string | null };
type Incoming = { id: string; userId: string; name: string };
type Graph = { friends: Person[]; incoming: Incoming[]; outgoing: Incoming[] };

const EMPTY: Graph = { friends: [], incoming: [], outgoing: [] };

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-medium"
      style={{ background: "var(--panel-hover)", color: "var(--text-2)" }}
    >
      {initial}
    </span>
  );
}

export default function FriendsPage() {
  const { isReady } = useRequireAuth();

  const [graph, setGraph] = useState<Graph | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authFetch("/api/friends");
      setGraph(response.ok ? await response.json() : EMPTY);
    } catch {
      setGraph(EMPTY);
    }
  }, []);

  useEffect(() => {
    if (isReady) void load();
  }, [isReady, load]);

  const search = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setMessage(null);

      if (!isSearchableHandle(query)) {
        setMessage("Type the whole username you are looking for.");
        setResults(null);
        return;
      }

      setIsSearching(true);
      try {
        const response = await authFetch(
          `/api/friends?q=${encodeURIComponent(query.trim())}`
        );
        const data = response.ok ? await response.json() : { results: [] };
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [query]
  );

  const act = useCallback(
    async (payload: Record<string, string>, key: string) => {
      setBusyId(key);
      setMessage(null);
      try {
        const response = await authFetch("/api/friends", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setMessage(data?.error || "That did not work. Please try again.");
          return;
        }
        setResults(null);
        setQuery("");
        await load();
      } catch {
        setMessage("That did not work. Please try again.");
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  if (!isReady || graph === null) {
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-40" />
        <div className="skeleton mt-8 h-[52px] w-full" />
        <div className="skeleton mt-6 h-[180px] w-full" />
      </div>
    );
  }

  const hasAnyone =
    graph.friends.length > 0 || graph.incoming.length > 0 || graph.outgoing.length > 0;

  return (
    <div className="app-page">
      <h1 className="t-page">Friends</h1>
      <p className="t-body mt-2">
        Challenge someone to the material you are both studying.
      </p>

      {/* ---- Find someone ---- */}
      <form onSubmit={search} className="mt-6 flex gap-2">
        <label htmlFor="friend-search" className="visually-hidden">
          Find someone by username
        </label>
        <input
          id="friend-search"
          className="field"
          placeholder="Their exact username"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-secondary shrink-0" disabled={isSearching}>
          {isSearching ? "Looking…" : "Find"}
        </button>
      </form>
      <p className="t-meta mt-2">
        You need their exact username. AcedIQ does not list other students.
      </p>

      {message && (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[14px]"
          style={{
            borderColor: "rgb(251 191 36 / 0.3)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
          }}
        >
          {message}
        </p>
      )}

      {results !== null && (
        <section className="mt-5">
          {results.length === 0 ? (
            <p className="t-meta">
              No one matches that username. Check the spelling with them.
            </p>
          ) : (
            <ul className="card divide-y" style={{ borderColor: "var(--line)" }}>
              {results.map((person) => (
                <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={person.name} />
                  <span
                    className="min-w-0 flex-1 truncate text-[15px]"
                    style={{ color: "var(--text-1)" }}
                  >
                    {person.name}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm shrink-0"
                    disabled={busyId === person.id}
                    onClick={() => act({ action: "request", userId: person.id }, person.id)}
                  >
                    {busyId === person.id ? "Sending…" : "Add"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- Waiting on you ---- */}
      {graph.incoming.length > 0 && (
        <section className="mt-10">
          <h2 className="t-section">Waiting on you</h2>
          <ul className="card mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {graph.incoming.map((request) => (
              <li key={request.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={request.name} />
                <span
                  className="min-w-0 flex-1 truncate text-[15px]"
                  style={{ color: "var(--text-1)" }}
                >
                  {request.name}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm shrink-0"
                  disabled={busyId === request.id}
                  onClick={() => act({ action: "accept", requestId: request.id }, request.id)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm shrink-0"
                  disabled={busyId === request.id}
                  onClick={() => act({ action: "decline", requestId: request.id }, request.id)}
                >
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Friends ---- */}
      {graph.friends.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="t-section">Your friends</h2>
            <p className="t-meta">Challenge them from any finished session</p>
          </div>
          <ul className="card mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {graph.friends.map((friend) => (
              <li key={friend.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={friend.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]" style={{ color: "var(--text-1)" }}>
                    {friend.name}
                  </p>
                  {friend.rank && <p className="t-meta truncate">{friend.rank}</p>}
                </div>
                {/* No "Challenge" button here on purpose. A challenge is a
                    link to a specific finished set, created at the end of a
                    session -- a button here could only dump the student on
                    the library to pick one, which is not what the word
                    promises. */}
                <button
                  type="button"
                  className="btn btn-quiet btn-sm shrink-0"
                  disabled={busyId === friend.id}
                  onClick={() => act({ action: "remove", userId: friend.id }, friend.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Sent ---- */}
      {graph.outgoing.length > 0 && (
        <section className="mt-10">
          <h2 className="t-section">Sent</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {graph.outgoing.map((request) => (
              <li key={request.id} className="chip">
                {request.name} · waiting
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Nothing yet ---- */}
      {!hasAnyone && results === null && (
        <section className="card mt-8 px-6 py-12 text-center">
          <p className="text-[17px] font-medium" style={{ color: "var(--text-1)" }}>
            Studying is better with someone to beat
          </p>
          <p className="t-body mx-auto mt-2 max-w-sm">
            Add a friend by username and you can challenge each other on any
            deck, compare where you are strongest, and rematch after a loss.
          </p>
          <p className="t-meta mx-auto mt-4 max-w-sm">
            No one to add yet? Send anyone a challenge link straight from a
            finished session — they can play it without an account.
          </p>
          <Link href="/library" className="btn btn-secondary mt-6">
            Go to your material
          </Link>
        </section>
      )}
    </div>
  );
}
