"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/trackEvent";
import { FLOATING_ACTION } from "@/lib/uiLayout";
import { Button } from "@/app/components/ui/Button";
import { springSmooth } from "@/lib/motion";

const LAST_LOGIN_EMAIL_KEY = "studyjoust_last_login_email";

// Reads a "?redirect=" query param directly from window.location instead of
// using Next.js's useSearchParams() hook. useSearchParams() requires a
// Suspense boundary around any component that calls it, and forgetting that
// boundary is a well-known cause of blank/crashed pages specifically in
// production builds on Vercel, even when everything looks fine in
// `next dev`. Reading window.location.search directly avoids that entirely.
// Only internal, single-slash paths are allowed, to guard against
// open-redirect attacks via a crafted ?redirect= value.
function getSafeRedirectTarget(fallback: string): string {
  if (typeof window === "undefined") return fallback;

  try {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");

    if (
      redirect &&
      redirect.startsWith("/") &&
      !redirect.startsWith("//") &&
      !redirect.includes("://")
    ) {
      return redirect;
    }
  } catch {
    // Malformed query string — fall through to the default below.
  }

  return fallback;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedEmail = window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY);
      if (savedEmail) {
        setEmail(savedEmail);
      }
    } catch {
      // Ignore localStorage access issues.
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Please enter your email and password.");
      return;
    }

    setIsSubmitting(true);

    // Everything below is wrapped in try/catch. A blank white screen is a
    // far worse outcome than a visible error message, so nothing here is
    // allowed to throw uncaught.
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }

      try {
        trackEvent("login_completed", { method: "password" });
      } catch {
        // Analytics failures should never block a successful login.
      }

      const target = getSafeRedirectTarget("/account");

      try {
        window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email.trim());
      } catch {
        // Ignore localStorage access issues.
      }

      router.push(target);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);

    try {
      const target = getSafeRedirectTarget("/account");

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${target}`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsGoogleLoading(false);
      }
      // On success, the browser navigates away to Google's login page,
      // so there's nothing else to do here.
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not start Google sign-in. Please try again."
      );
      setIsGoogleLoading(false);
    }
  };

  const isAnyLoading = isSubmitting || isGoogleLoading;

  return (
    <main className="relative min-h-dvh w-full overflow-x-hidden bg-[#05050a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-indigo-600/20 blur-[130px]" />
      </div>

      {/* Grid texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className={`relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 pt-14 sm:px-6 sm:pt-20 ${FLOATING_ACTION.mobileBottomPadding}`}>
        {/* Badge */}
        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-indigo-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
          WELCOME BACK
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-400 to-indigo-400 bg-clip-text text-transparent">
            Log In
          </span>
        </h1>
        <p className="mt-3 max-w-sm text-center text-sm text-white/50 sm:text-base">
          Log in to pick up where you left off.
        </p>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springSmooth}
          className="mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:mt-10 sm:p-6"
        >
          {/* Google OAuth button */}
          <Button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isAnyLoading}
            isLoading={isGoogleLoading}
            loadingLabel="Continue with Google"
            variant="ghost"
            fullWidth
          >
            <svg className="h-4.5 w-4.5 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.3-1.66 3.8-5.5 3.8-3.31 0-6.02-2.74-6.02-6.1s2.7-6.1 6.02-6.1c1.89 0 3.16.8 3.88 1.5l2.65-2.55C16.9 3.06 14.7 2 12 2 6.98 2 2.93 6.06 2.93 11s4.05 9 9.07 9c5.24 0 8.71-3.68 8.71-8.86 0-.6-.07-1.05-.15-1.5H12z"
              />
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-semibold uppercase tracking-wider text-white/30">
              or
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
                disabled={isAnyLoading}
                className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 sm:py-3 sm:text-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="password"
                className="text-xs font-bold uppercase tracking-wider text-white/60"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  disabled={isAnyLoading}
                  className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 pr-12 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 sm:py-3 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-white/55 transition-colors duration-150 hover:bg-white/10 hover:text-white/80"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAnyLoading}
              className="group relative mt-2 flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(79,70,229,0.6)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 sm:py-3.5 sm:hover:scale-[1.02] sm:text-sm"
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon />
                  <span className="relative z-10">Logging In...</span>
                </>
              ) : (
                <span className="relative z-10">Log In</span>
              )}
              {!isAnyLoading && (
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/25 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
              )}
            </button>

            {errorMessage && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <span className="min-w-0 break-words">{errorMessage}</span>
              </div>
            )}
          </form>
        </motion.div>

        <p className="mt-6 text-center text-sm text-white/40">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-indigo-300 hover:text-indigo-200"
          >
            Sign up
          </Link>
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
          <Link href="/demo/battle" className="text-indigo-200/90 hover:text-indigo-100">
            Try Demo First
          </Link>
          <span className="text-white/20">•</span>
          <Link href="/pricing" className="text-indigo-200/90 hover:text-indigo-100">
            View Plans
          </Link>
        </div>

        <p className="mt-3 text-center text-xs text-white/35">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="text-indigo-200 hover:text-indigo-100">Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="text-indigo-200 hover:text-indigo-100">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}

// Module-level, not defined inside LoginPage — keeps identity stable across
// re-renders so React never remounts the subtree beneath it.
function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
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
  );
}