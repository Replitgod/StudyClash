"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";

type PlanInfo = {
  id: string;
  label: string;
  daily_limit: number | null;
  description: string;
};

export default function AccountPage() {
  const router = useRouter();
  const { user, profile, isLoggedIn, isLoading } = useAuth();

  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [decksToday, setDecksToday] = useState<number | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function loadUsageAndPlan() {
      if (!user || !profile) return;

      setIsLoadingUsage(true);
      setUsageError(null);

      // Load the plan's display details (label, daily limit)
      const { data: planData, error: planError } = await supabase
        .from("membership_plans")
        .select("*")
        .eq("id", profile.plan)
        .single();

      if (planError) {
        setUsageError(planError.message);
        setIsLoadingUsage(false);
        return;
      }

      // Count how many decks this user generated today.
      // "Today" is midnight local time up to now.
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { count, error: countError } = await supabase
        .from("generation_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startOfToday.toISOString());

      if (countError) {
        setUsageError(countError.message);
        setIsLoadingUsage(false);
        return;
      }

      setPlanInfo(planData);
      setDecksToday(count || 0);
      setIsLoadingUsage(false);
    }

    if (isLoggedIn && user && profile) {
      loadUsageAndPlan();
    }
  }, [isLoggedIn, user, profile]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  };

  // ---------- Shared background wrapper ----------
  const Background = ({ children }: { children: React.ReactNode }) => (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-14 sm:px-6 sm:py-20">
        {children}
      </div>
    </main>
  );

  // ---------- Auth loading state ----------
  if (isLoading) {
    return (
      <Background>
        <svg
          className="h-10 w-10 animate-spin text-fuchsia-400"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="mt-4 text-sm text-white/50">Loading account...</p>
      </Background>
    );
  }

  // ---------- Not logged in ----------
  if (!isLoggedIn) {
    return (
      <Background>
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center backdrop-blur-sm sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fuchsia-500/10">
            <svg
              className="h-6 w-6 text-fuchsia-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-bold text-white">
            You&apos;re not logged in
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Log in to view your account, membership plan, and daily usage.
          </p>
          <Link
            href="/login"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
          >
            Go to Login
          </Link>
        </div>
      </Background>
    );
  }

  // ---------- Logged in ----------
  const dailyLimitLabel =
    planInfo?.daily_limit == null ? "Unlimited" : `${planInfo.daily_limit} / day`;

  const usagePercent =
    planInfo?.daily_limit && decksToday !== null
      ? Math.min(100, Math.round((decksToday / planInfo.daily_limit) * 100))
      : null;

  return (
    <Background>
      <div className="w-full max-w-md">
        {/* Badge */}
        <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          YOUR ACCOUNT
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Account
          </span>
        </h1>

        {/* Account card */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
          {/* Email */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 text-fuchsia-300">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Signed in as
              </p>
              <p className="truncate text-sm font-bold text-white/90">
                {user?.email}
              </p>
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            {isLoadingUsage ? (
              <div className="flex items-center gap-2 text-sm text-white/40">
                <svg
                  className="h-4 w-4 flex-shrink-0 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Loading plan details...
              </div>
            ) : usageError ? (
              <p className="text-sm text-red-300">{usageError}</p>
            ) : (
              <>
                {/* Plan */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                    Membership Plan
                  </p>
                  <span className="rounded-full bg-gradient-to-r from-fuchsia-500/20 to-cyan-500/20 px-3 py-1 text-xs font-bold text-fuchsia-300">
                    {planInfo?.label || profile?.plan}
                  </span>
                </div>
                {planInfo?.description && (
                  <p className="mt-1.5 text-xs text-white/40">
                    {planInfo.description}
                  </p>
                )}

                {/* Usage */}
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Decks Generated Today
                    </p>
                    <span className="text-sm font-bold text-cyan-300">
                      {decksToday} / {dailyLimitLabel}
                    </span>
                  </div>

                  {usagePercent !== null && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          usagePercent >= 100
                            ? "bg-red-400"
                            : "bg-gradient-to-r from-fuchsia-500 to-cyan-400"
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/login?redirect=/create"
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
            >
              Create a Battle Deck
            </Link>
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-bold text-white/80 transition-colors duration-150 hover:border-fuchsia-400/30 hover:bg-white/10"
            >
              View Plans
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/5 px-6 py-3.5 text-sm font-bold text-red-300 transition-colors duration-150 hover:border-red-400/40 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoggingOut ? "Logging Out..." : "Log Out"}
            </button>
          </div>
        </div>
      </div>
    </Background>
  );
}