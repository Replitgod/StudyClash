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
// production builds (it can look fine in `next dev` and still break on
// Vercel). Reading window.location.search directly avoids that entirely.
// This also guards against open-redirect attacks by only allowing internal,
// single-slash paths.
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

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      setErrorMessage("Please enter an email and password.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    trackEvent("signup_started", { method: "password" });

    // The entire signup flow is wrapped in try/catch. Nothing in here should
    // ever be allowed to throw uncaught — a blank white screen is far worse
    // for the user than a visible error message.
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }

      if (!data?.user) {
        setErrorMessage("Something went wrong creating your account. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // If Supabase returns an active session right away, email confirmation
      // is not required on this project, and the user is already signed in.
      if (data.session) {
        try {
          trackEvent("signup_completed", {
            method: "password",
            requiredEmailConfirmation: false,
          });
        } catch {
          // Analytics failures should never block a successful signup.
        }

        const target = getSafeRedirectTarget("/account");

        try {
          window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email.trim());
        } catch {
          // Ignore localStorage access issues.
        }

        router.push(target);
        return;
      }

      // Otherwise, this project requires the user to confirm their email
      // before they can sign in. Show a clear message instead of a
      // confusing redirect to a page they can't use yet.
      try {
        trackEvent("signup_completed", {
          method: "password",
          requiredEmailConfirmation: true,
        });
      } catch {
        // Analytics failures should never block a successful signup.
      }

      setIsSubmitting(false);
      setNeedsEmailConfirmation(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    trackEvent("signup_started", { method: "google" });

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
          JOIN THE BETA
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-400 to-indigo-400 bg-clip-text text-transparent">
            Create Your Account
          </span>
        </h1>
        <p className="mt-3 max-w-sm text-center text-sm text-white/50 sm:text-base">
          Sign up to start generating and battling with your own study decks.
        </p>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springSmooth}
          className="mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:mt-10 sm:p-6"
        >
          {needsEmailConfirmation ? (
            /* Email confirmation required state */
            <div className="flex flex-col items-center py-4 text-center" role="status" aria-live="polite">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
                <svg
                  className="h-6 w-6 text-indigo-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <p className="mt-3 text-sm font-semibold text-white">
                Check your email to confirm your account.
              </p>
              <p className="mt-1.5 break-words text-xs text-white/50">
                We sent a confirmation link to{" "}
                <span className="text-white/80">{email}</span>. Click the
                link, then log in below. If you don&apos;t see it in a
                minute, check your spam folder.
              </p>
              <Button href="/login" variant="primary" fullWidth className="mt-5">
                Go to Login
              </Button>
            </div>
          ) : (
            <>
              {/* Google OAuth button */}
              <Button
                type="button"
                onClick={handleGoogleSignup}
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

              {/* Signup form */}
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
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
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

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="confirmPassword"
                    className="text-xs font-bold uppercase tracking-wider text-white/60"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      required
                      disabled={isAnyLoading}
                      className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 pr-12 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-indigo-400/50 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 sm:py-3 sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-white/55 transition-colors duration-150 hover:bg-white/10 hover:text-white/80"
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? "Hide" : "Show"}
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
                      <span className="relative z-10">Creating Account...</span>
                    </>
                  ) : (
                    <span className="relative z-10">Create Account</span>
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
            </>
          )}
        </motion.div>

        {!needsEmailConfirmation && (
          <>
            <p className="mt-6 text-center text-sm text-white/40">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-indigo-300 hover:text-indigo-200"
              >
                Log in
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
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="text-indigo-200 hover:text-indigo-100">Terms</Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-indigo-200 hover:text-indigo-100">Privacy Policy</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

// Module-level, not defined inside SignupPage — this keeps its identity
// stable across every re-render, which matters because a component defined
// inside another component's body gets recreated on every render, causing
// React to remount its subtree (the classic "input loses focus after one
// keystroke" bug). Nothing in this file redefines components on render.
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