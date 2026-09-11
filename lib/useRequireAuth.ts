"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";

// Sends a signed-out visitor to log in, remembering where they were headed.
//
// Every app screen needs this, and before it existed each one hand-rolled
// the same effect with a hardcoded redirect path -- so some screens sent
// people to /login with no redirect, and a couple (Library, Practice, Vyra)
// simply rendered an empty version of themselves to anyone not signed in,
// which reads as "the app is broken" rather than "you need an account".
//
// The remembered destination has to include the query string. A session URL
// carries everything that makes it the *right* session --
// `/study/<id>?mode=weak_topic&topics=Ionic+bonding&limit=10` -- and
// usePathname() returns only the path. Dropping the query sent a student who
// clicked "Review what you forgot", signed in, and came back to a generic
// session over the whole deck instead of the ten questions they had missed.
/**
 * Should this visitor be sent to log in?
 *
 * Pulled out as a pure function because it is the part that was wrong, and
 * the part worth pinning: the hook around it is a router call and an effect,
 * but the DECISION has three inputs and one of them was being ignored.
 *
 * `hasSession` is what the auth client itself reports. It is separate from
 * `isLoggedIn` (what the React context currently believes) precisely because
 * they disagree for a moment after signing in, and that disagreement is the
 * whole bug.
 */
export function shouldRedirectToLogin(args: {
  /** The provider has not finished its first getSession() yet. */
  isLoading: boolean;
  /** What the auth context believes right now. A cache. */
  isLoggedIn: boolean;
  /** What the auth client reports. The truth, or null if it could not be asked. */
  hasSession: boolean | null;
}): boolean {
  const { isLoading, isLoggedIn, hasSession } = args;

  // Nothing is known yet. Redirecting now would bounce people who are about
  // to turn out to be signed in.
  if (isLoading) return false;

  // The context already agrees they are signed in.
  if (isLoggedIn) return false;

  // The context says signed out. Before acting on that, the client gets the
  // final word -- this is the case that made people log in twice.
  if (hasSession === true) return false;

  // hasSession === false is a confirmed signed-out visitor.
  // hasSession === null means the client could not be asked at all, and
  // failing towards the login screen is the safe direction: worst case they
  // sign in again, rather than sitting on a screen that will never load.
  return true;
}

export function useRequireAuth(): { isReady: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || isLoggedIn) return;

    let cancelled = false;

    // Confirm against the auth client before bouncing anyone.
    //
    // This is what made people log in twice. Sitting on /login, the provider
    // has already finished its getSession() and settled on
    // isLoading=false, isLoggedIn=false. A successful sign-in persists the
    // session and navigates immediately, but onAuthStateChange is an event
    // callback that has not necessarily run by the time the destination
    // mounts -- so this effect saw a stale "signed out", redirected back to
    // /login, and the second attempt worked only because the session was
    // already there.
    //
    // The context is a cache of the auth client's state; the client is the
    // truth. Asking it directly costs one local read (the session is in
    // storage, not over the network) and removes the race entirely rather
    // than papering over it with a timeout.
    void (async () => {
      let hasSession: boolean | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        hasSession = Boolean(data.session);
      } catch {
        // Left null: the client could not be asked. shouldRedirectToLogin
        // treats that as "send them to log in", which is the safe direction.
      }
      if (cancelled) return;

      if (!shouldRedirectToLogin({ isLoading, isLoggedIn, hasSession })) return;

      // Read the query off the live URL rather than useSearchParams(), which
      // would opt every caller of this hook into a Suspense boundary.
      const search = typeof window === "undefined" ? "" : window.location.search;
      const target = `${pathname || "/home"}${search}`;
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, isLoggedIn, pathname, router]);

  return { isReady: !isLoading && isLoggedIn };
}
