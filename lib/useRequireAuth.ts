"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

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
export function useRequireAuth(): { isReady: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || isLoggedIn) return;
    // Read the query off the live URL rather than useSearchParams(), which
    // would opt every caller of this hook into a Suspense boundary.
    const search = typeof window === "undefined" ? "" : window.location.search;
    const target = `${pathname || "/home"}${search}`;
    router.replace(`/login?redirect=${encodeURIComponent(target)}`);
  }, [isLoading, isLoggedIn, pathname, router]);

  return { isReady: !isLoading && isLoggedIn };
}
