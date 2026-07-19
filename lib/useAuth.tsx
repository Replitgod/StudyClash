"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { supabase } from "@/lib/supabase";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  email: string | null;
  plan: string;
  created_at: string;
  display_name?: string | null;
  roasts_enabled?: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  refreshProfile: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// How many times to retry loading the profile if it's not found yet, and
// how long to wait between attempts. New signups get their `profiles` row
// created by an async database trigger, so there's a brief window right
// after signup where the session exists but the profile row doesn't yet.
const PROFILE_RETRY_DELAYS_MS = [400, 900, 1500];

// This provider does the actual auth work exactly ONCE, at the root of the
// app (mounted in layout.tsx). Every page that calls useAuth() below just
// reads this shared state instead of independently re-fetching it — that's
// what eliminates the "loading flicker on every navigation" problem.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadRequestIdRef = useRef(0);

  const loadProfile = useCallback(async (userId: string) => {
    const requestId = ++loadRequestIdRef.current;
    setProfileError(null);

    for (let attempt = 0; attempt <= PROFILE_RETRY_DELAYS_MS.length; attempt++) {
      if (requestId !== loadRequestIdRef.current) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (requestId !== loadRequestIdRef.current) return;

        if (!error && data) {
          setProfile(data);
          setProfileError(null);
          return;
        }

        if (attempt < PROFILE_RETRY_DELAYS_MS.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, PROFILE_RETRY_DELAYS_MS[attempt])
          );
          continue;
        }

        setProfile(null);
        setProfileError(
          "We couldn't load your account details yet. This sometimes happens right after signing up — try refreshing in a moment."
        );
        return;
      } catch (err) {
        if (requestId !== loadRequestIdRef.current) return;

        if (attempt < PROFILE_RETRY_DELAYS_MS.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, PROFILE_RETRY_DELAYS_MS[attempt])
          );
          continue;
        }

        setProfile(null);
        setProfileError(
          err instanceof Error
            ? err.message
            : "Failed to load your account details."
        );
        return;
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (error) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        setSession(data.session);
        setUser(data.session?.user ?? null);

        if (data.session?.user) {
          loadProfile(data.session.user.id);
        }

        setIsLoading(false);
      } catch {
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsLoading(false);
      }
    }

    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, newSession: Session | null) => {
        if (!isMounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          loadProfile(newSession.user.id);
        } else {
          setProfile(null);
          setProfileError(null);
        }
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => {
    if (user) {
      loadProfile(user.id);
    }
  }, [user, loadProfile]);

  const value: AuthContextValue = {
    session,
    user,
    profile,
    profileError,
    isLoading,
    isLoggedIn: !!user,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Same hook name, same return shape as before — every page that already
// calls useAuth() keeps working with zero changes. The only difference is
// it now reads shared state instead of independently fetching it.
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}