"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User, AuthChangeEvent } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  email: string | null;
  plan: string;
  created_at: string;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Failed to load profile", error);
        setProfile(null);
        return;
      }

      setProfile((data as Profile | null) ?? null);
    } catch (error) {
      console.error("Failed to load profile", error);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Check for an existing session on first load (e.g. page refresh)
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!isMounted) return;

      setSession(data.session);
      setUser(data.session?.user ?? null);

      if (data.session?.user) {
        loadProfile(data.session.user.id);
      }

      setIsLoading(false);
    });

    // Keep this in sync whenever auth state changes (login, logout,
    // token refresh) anywhere in the app.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, newSession: Session | null) => {
        if (!isMounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          loadProfile(newSession.user.id);
        } else {
          setProfile(null);
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

  return {
    session,
    user,
    profile,
    isLoading,
    isLoggedIn: !!user,
    refreshProfile,
  };
}