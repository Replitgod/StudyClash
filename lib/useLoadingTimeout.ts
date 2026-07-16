"use client";

import { useEffect, useState } from "react";

// If a loading state hangs (dead network, stalled Supabase query) rather
// than resolving one way or the other, callers can offer a way out instead
// of leaving the user on an indefinite spinner. Resets automatically once
// `isLoading` goes false, so a normal fast load never trips it.
export function useLoadingTimeout(isLoading: boolean, timeoutMs = 8000): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  return timedOut;
}
