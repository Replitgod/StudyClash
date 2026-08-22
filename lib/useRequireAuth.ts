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
export function useRequireAuth(): { isReady: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || isLoggedIn) return;
    const target = pathname || "/home";
    router.replace(`/login?redirect=${encodeURIComponent(target)}`);
  }, [isLoading, isLoggedIn, pathname, router]);

  return { isReady: !isLoading && isLoggedIn };
}
