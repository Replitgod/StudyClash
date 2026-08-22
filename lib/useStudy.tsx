"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/useAuth";
import {
  EMPTY_SNAPSHOT,
  fetchSnapshot,
  type StudySnapshot,
} from "@/lib/studySnapshot";

type StudyContextValue = {
  snapshot: StudySnapshot;
  isLoading: boolean;
  error: string | null;
  /** Re-read from the database, e.g. after finishing a session. */
  refresh: () => void;
};

const StudyContext = createContext<StudyContextValue | null>(null);

// Mounted once, inside the app shell. Every app screen reads from here
// rather than issuing its own queries, so navigating Home -> Library ->
// Practice does not refetch the same rows three times.
export function StudyProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<StudySnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow response from a previous user id overwriting a
  // newer one (sign out then sign in as someone else).
  const requestIdRef = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (isAuthLoading) return;

    const userId = user?.id;
    const requestId = ++requestIdRef.current;

    if (!userId) {
      setSnapshot(EMPTY_SNAPSHOT);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchSnapshot(userId)
      .then((next) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setSnapshot(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError(
          err instanceof Error
            ? err.message
            : "We could not load your study data. Please refresh."
        );
      })
      .finally(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, isAuthLoading, reloadToken]);

  const value = useMemo(
    () => ({ snapshot, isLoading: isLoading || isAuthLoading, error, refresh }),
    [snapshot, isLoading, isAuthLoading, error, refresh]
  );

  return <StudyContext.Provider value={value}>{children}</StudyContext.Provider>;
}

export function useStudy(): StudyContextValue {
  const context = useContext(StudyContext);
  if (!context) {
    // Rendering an app screen outside the provider is a wiring mistake, but
    // it should degrade to an empty state rather than crash the page.
    return {
      snapshot: EMPTY_SNAPSHOT,
      isLoading: false,
      error: null,
      refresh: () => {},
    };
  }
  return context;
}
