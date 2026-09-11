import { describe, expect, it } from "vitest";
import { shouldRedirectToLogin } from "@/lib/useRequireAuth";

// The double-login bug, pinned.
//
// Signing in persists the session and navigates immediately, but the auth
// CONTEXT is updated by an onAuthStateChange callback that has not
// necessarily run by the time the next screen mounts. Sitting on /login the
// provider has already settled on isLoading=false, isLoggedIn=false, so the
// guard on the destination saw a stale "signed out", sent the user back to
// /login, and the second attempt only worked because the session was in
// storage by then.
//
// The failure is close to invisible in development, where the callback
// usually wins the race. It shows up for real users, on slower machines, as
// "I have to log in twice to get into the website" -- which is the worst
// kind of bug to leave untested, because reproducing it depends on timing
// nobody controls.

describe("shouldRedirectToLogin", () => {
  it("does not redirect when the client has a session the context has not seen", () => {
    // The exact moment after a successful sign-in. This case is the bug.
    expect(
      shouldRedirectToLogin({ isLoading: false, isLoggedIn: false, hasSession: true })
    ).toBe(false);
  });

  it("redirects a confirmed signed-out visitor", () => {
    expect(
      shouldRedirectToLogin({ isLoading: false, isLoggedIn: false, hasSession: false })
    ).toBe(true);
  });

  it("waits while the provider is still loading, whatever the client says", () => {
    // Redirecting here would bounce people who are about to turn out to be
    // signed in, which is the same bug wearing a different hat.
    for (const hasSession of [true, false, null]) {
      expect(shouldRedirectToLogin({ isLoading: true, isLoggedIn: false, hasSession })).toBe(
        false
      );
    }
  });

  it("does nothing once the context already reports a signed-in user", () => {
    for (const hasSession of [true, false, null]) {
      expect(shouldRedirectToLogin({ isLoading: false, isLoggedIn: true, hasSession })).toBe(
        false
      );
    }
  });

  it("fails towards the login screen when the client cannot be asked", () => {
    // Worst case the user signs in again. The alternative is leaving them on
    // a screen that will never load their data and never explain why.
    expect(
      shouldRedirectToLogin({ isLoading: false, isLoggedIn: false, hasSession: null })
    ).toBe(true);
  });

  it("treats the context as a cache and the client as the truth", () => {
    // Stated as its own case because it is the design rule the fix rests on:
    // whenever the two disagree about a session existing, the client wins.
    const contextSaysNo = { isLoading: false, isLoggedIn: false };
    expect(shouldRedirectToLogin({ ...contextSaysNo, hasSession: true })).toBe(false);
    expect(shouldRedirectToLogin({ ...contextSaysNo, hasSession: false })).toBe(true);
  });
});
