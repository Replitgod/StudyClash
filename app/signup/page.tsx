"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const redirectParam = searchParams.get("redirect");
  const safeRedirect =
    typeof redirectParam === "string" &&
    redirectParam.startsWith("/") &&
    !redirectParam.startsWith("//")
      ? redirectParam
      : "/account";

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

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    // If Supabase returns an active session right away, email confirmation
    // is not required on this project, and the user is already signed in.
    if (data.session) {
      router.push(safeRedirect);
      return;
    }

    // Otherwise, this project requires the user to confirm their email
    // before they can sign in. Show a clear message instead of a
    // confusing redirect to a page they can't use yet.
    setIsSubmitting(false);
    setNeedsEmailConfirmation(true);
  };

  const handleGoogleSignup = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);

    // Signing up and logging in with Google are the same call — Supabase
    // creates the account automatically on first OAuth login, so there's
    // no separate "signUpWithOAuth" method.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${safeRedirect}`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsGoogleLoading(false);
    }
    // On success, the browser navigates away to Google's login page,
    // so there's nothing else to do here.
  };

  const isAnyLoading = isSubmitting || isGoogleLoading;

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[450px] w-[450px] rounded-full bg-violet-600/20 blur-[130px]" />
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

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-14 sm:px-6 sm:py-20">
        {/* Badge */}
        <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm sm:mb-6">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
          JOIN THE BETA
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Create Your Account
          </span>
        </h1>
        <p className="mt-3 max-w-sm text-center text-sm text-white/50 sm:text-base">
          Sign up to start generating and battling with your own study decks.
        </p>

        {/* Form card */}
        <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:mt-10 sm:p-6">
          {needsEmailConfirmation ? (
            /* Email confirmation required state */
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/10">
                <svg
                  className="h-6 w-6 text-cyan-300"
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
                Check your email
              </p>
              <p className="mt-1.5 break-words text-xs text-white/50">
                We sent a confirmation link to{" "}
                <span className="text-white/80">{email}</span>. Confirm your
                email, then log in below.
              </p>
              <Link
                href={`/login?redirect=${encodeURIComponent(safeRedirect)}`}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <>
              {/* Google OAuth button */}
              <button
                type="button"
                onClick={handleGoogleSignup}
                disabled={isAnyLoading}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 transition-colors duration-150 hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGoogleLoading ? (
                  <SpinnerIcon />
                ) : (
                  <svg className="h-4.5 w-4.5 flex-shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.5c-.24 1.3-1.66 3.8-5.5 3.8-3.31 0-6.02-2.74-6.02-6.1s2.7-6.1 6.02-6.1c1.89 0 3.16.8 3.88 1.5l2.65-2.55C16.9 3.06 14.7 2 12 2 6.98 2 2.93 6.06 2.93 11s4.05 9 9.07 9c5.24 0 8.71-3.68 8.71-8.86 0-.6-.07-1.05-.15-1.5H12z"
                    />
                  </svg>
                )}
                Continue with Google
              </button>

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
                    required
                    disabled={isAnyLoading}
                    className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 disabled:opacity-50 sm:py-3 sm:text-sm"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="password"
                    className="text-xs font-bold uppercase tracking-wider text-white/60"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                    disabled={isAnyLoading}
                    className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 disabled:opacity-50 sm:py-3 sm:text-sm"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="confirmPassword"
                    className="text-xs font-bold uppercase tracking-wider text-white/60"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    disabled={isAnyLoading}
                    className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder-white/30 outline-none transition-colors duration-150 focus:border-fuchsia-400/50 focus:ring-2 focus:ring-fuchsia-500/20 disabled:opacity-50 sm:py-3 sm:text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAnyLoading}
                  className="group relative mt-2 flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-6 py-4 text-base font-bold text-white shadow-[0_0_40px_-10px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 sm:py-3.5 sm:hover:scale-[1.02] sm:text-sm"
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
                  <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
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
        </div>

        {!needsEmailConfirmation && (
          <p className="mt-6 text-center text-sm text-white/40">
            Already have an account?{" "}
            <Link
              href={`/login?redirect=${encodeURIComponent(safeRedirect)}`}
              className="font-semibold text-fuchsia-300 hover:text-fuchsia-200"
            >
              Log in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-screen w-full overflow-x-hidden bg-[#05050a] text-white">
          <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-14 sm:px-6 sm:py-20">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-fuchsia-300 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" />
              LOADING
            </div>
            <p className="mt-4 text-sm text-white/50">Preparing signup...</p>
          </div>
        </main>
      }
    >
      <SignupPageContent />
    </Suspense>
  );
}

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