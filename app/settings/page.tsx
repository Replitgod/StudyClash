"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/lib/useAuth";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { OPEN_FEEDBACK_EVENT } from "@/lib/uiLayout";
import { FREE_PLAN_LIMIT_SUMMARY } from "@/lib/planLimits";
import { useTheme } from "@/lib/useTheme";
import { resolveTier } from "@/lib/tiers";
import {
  describeSubscription,
  isLiveSubscription,
  type SubscriptionStatus,
} from "@/lib/billing";

// Settings is deliberately boring. Nothing a student needs in order to
// study lives here -- it is name, billing, account, data, and the way out.

// Billing used to live on /account, which the four-destinations redesign
// removed without rehoming it. The API routes survived; nothing called
// them. That left a paying customer with no way to see their renewal date,
// change a card, or cancel -- and Stripe returning them to a 404 after
// paying. Both halves are fixed here; the wording of the status line is
// pure and tested in lib/billing.ts.

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
          {label}
        </p>
        {description && <p className="t-meta mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, isLoading, refreshProfile } = useAuth();

  // `profile.plan` carries legacy plan ids; resolveTier maps anything it
  // does not recognise to free rather than throwing.
  const currentTier = resolveTier(
    profile?.plan === "pro_individual" || profile?.plan === "pro" ? "pro" : profile?.plan
  );
  const { themeId, themes, setTheme, canUseThemes } = useTheme(currentTier.id);
  const { isReady } = useRequireAuth();

  const [name, setName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [billingUpdated, setBillingUpdated] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isPro = currentTier.id !== "free";
  const hasLiveSubscription = isLiveSubscription(subscription);

  useEffect(() => {
    setName(profile?.display_name?.trim() || "");
  }, [profile?.display_name]);

  // Stripe returns the customer here after checkout and after the billing
  // portal. Read off window.location rather than useSearchParams so this
  // page does not need a Suspense boundary just to show a banner -- same
  // approach /pricing already uses for its cancelled banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJustPaid(params.get("checkout") === "success");
    setBillingUpdated(params.get("billing") === "updated");
  }, []);

  const loadSubscription = useCallback(async () => {
    try {
      const response = await authFetch("/api/stripe/subscription");
      if (!response.ok) return;
      const data = await response.json();
      setSubscription((data?.subscription as SubscriptionStatus | null) ?? null);
    } catch {
      // Billing status is decoration on this page -- the plan chip below is
      // driven by profiles.plan, which the webhook owns. Failing to load it
      // must not take out Settings.
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void loadSubscription();
  }, [user?.id, loadSubscription]);

  // Stripe redirects the customer back the instant the payment clears,
  // which is usually *before* the webhook that grants Pro has landed. With
  // no poll the customer sees "Free" on the page they were sent to by a
  // successful payment, which reads as "it didn't work". Re-check a few
  // times, then stop -- the banner explains the wait either way.
  useEffect(() => {
    if (!justPaid || !user?.id) return;
    if (profile?.plan === "pro_individual" || profile?.plan === "pro") return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      refreshProfile();
      void loadSubscription();
      if (attempts >= 5) clearInterval(timer);
    }, 2000);

    return () => clearInterval(timer);
  }, [justPaid, user?.id, profile?.plan, refreshProfile, loadSubscription]);

  const openBillingPortal = useCallback(async () => {
    setBillingError(null);
    setIsOpeningPortal(true);
    try {
      const response = await authFetch("/api/stripe/portal", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.url) {
        setBillingError(data.error || "Could not open the billing portal. Please try again.");
        setIsOpeningPortal(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setBillingError("Could not open the billing portal. Please try again.");
      setIsOpeningPortal(false);
    }
  }, []);

  const exportData = useCallback(async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      const response = await authFetch("/api/account/export");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setExportError(data.error || "Could not prepare your data. Please try again.");
        setIsExporting(false);
        return;
      }

      // Saved straight from the response rather than opening a URL, so the
      // request keeps its Authorization header and the file never becomes a
      // link that could be shared by accident.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `acedecks-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not prepare your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const response = await authFetch("/api/account", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDeleteError(data.error || "Could not delete your account. Please try again.");
        setIsDeleting(false);
        return;
      }
      // The account is gone; the session token is now worthless. Sign out
      // locally so the app does not keep rendering as a user that no longer
      // exists, then leave for the marketing site.
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch {
      setDeleteError("Could not delete your account. Please try again.");
      setIsDeleting(false);
    }
  }, []);

  const saveName = async () => {
    if (!user?.id) return;
    const trimmed = name.trim();
    setIsSavingName(true);
    setNameStatus(null);

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: trimmed || null })
      .eq("id", user.id);

    setIsSavingName(false);
    if (error) {
      setNameStatus("Could not save that. Please try again.");
      return;
    }
    setNameStatus("Saved.");
    refreshProfile();
  };

  const signOut = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.push("/");
  };

  if (isLoading || !isReady) {
    return (
      <div className="app-page">
        <div className="skeleton h-9 w-40" />
        <div className="skeleton mt-8 h-[180px] w-full" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <h1 className="t-page">Settings</h1>

      {justPaid && (
        <div
          className="card mt-6 px-4 py-4"
          role="status"
          style={{ borderColor: "var(--accent-line)", background: "var(--accent-soft)" }}
        >
          <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            {isPro ? "You're on Ace Pro. Everything is unlocked." : "Payment received. Switching Pro on…"}
          </p>
          <p className="t-meta mt-1">
            {isPro
              ? "Thanks for supporting AceDecks. Your receipt is in your email."
              : "This usually takes a few seconds. You can start studying now — Pro applies to your account, not to this tab."}
          </p>
        </div>
      )}

      {billingUpdated && !justPaid && (
        <div className="card mt-6 px-4 py-4" role="status">
          <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
            Billing updated.
          </p>
          <p className="t-meta mt-1">Any change you made in the billing portal is saved.</p>
        </div>
      )}

      {/* ---- Account ---- */}
      <section className="mt-8">
        <h2 className="t-section">Account</h2>
        <div
          className="card mt-3 divide-y overflow-hidden"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="px-4 py-4">
            <label
              htmlFor="display-name"
              className="text-[15px] font-medium"
              style={{ color: "var(--text-1)" }}
            >
              Your name
            </label>
            <p className="t-meta mt-0.5">What AceDecks calls you.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={60}
                className="field max-w-xs flex-1"
              />
              <button
                type="button"
                onClick={() => void saveName()}
                disabled={isSavingName}
                className="btn btn-secondary"
              >
                {isSavingName ? "Saving…" : "Save"}
              </button>
            </div>
            {nameStatus && <p className="t-meta mt-2">{nameStatus}</p>}
          </div>

          <Row label="Email" description={user?.email || "—"} />

          {/* The description used to be the free-plan cap summary for
              everyone, so a paying customer was told about limits they had
              already paid to remove. It now describes the plan they are
              actually on. */}
          <Row
            label="Plan"
            description={
              isPro
                ? describeSubscription(subscription) || currentTier.tagline
                : FREE_PLAN_LIMIT_SUMMARY
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={isPro ? "chip chip-brand" : "chip"}>{currentTier.label}</span>
              {!isPro && (
                <Link href="/pricing" className="btn btn-sm btn-secondary">
                  Upgrade
                </Link>
              )}
              {hasLiveSubscription && (
                <button
                  type="button"
                  onClick={() => void openBillingPortal()}
                  disabled={isOpeningPortal}
                  className="btn btn-sm btn-secondary"
                >
                  {isOpeningPortal ? "Opening…" : "Manage billing"}
                </button>
              )}
            </div>
          </Row>

          {(billingError || subscription?.status === "past_due") && (
            <div className="px-4 py-3">
              {subscription?.status === "past_due" && (
                <p className="t-meta" style={{ color: "var(--warning)" }}>
                  Your last payment failed. Update your card in the billing portal to keep Pro.
                </p>
              )}
              {billingError && (
                <p className="t-meta mt-1" style={{ color: "var(--danger)" }} role="alert">
                  {billingError}
                </p>
              )}
            </div>
          )}

          <Row
            label="Theme"
            description={
              canUseThemes
                ? "Applies everywhere, instantly."
                : "Custom themes are part of Ace Pro."
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              {themes.map((theme) => {
                const active = theme.id === themeId;
                const locked = !canUseThemes && theme.id !== "acedecks";
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setTheme(theme.id)}
                    aria-pressed={active}
                    title={locked ? `${theme.label} — Ace Pro` : theme.description}
                    className="flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[12px] transition-colors"
                    style={{
                      borderColor: active ? "var(--accent-line)" : "var(--line)",
                      background: active ? "var(--accent-soft)" : "transparent",
                      color: active ? "var(--accent-bright)" : "var(--text-2)",
                      opacity: locked ? 0.55 : 1,
                    }}
                  >
                    <span aria-hidden="true" className="flex">
                      {theme.swatches.map((swatch) => (
                        <span
                          key={swatch}
                          className="h-3 w-3 rounded-full"
                          style={{
                            background: swatch,
                            marginLeft: swatch === theme.swatches[0] ? 0 : -5,
                            border: "1px solid rgb(0 0 0 / 0.4)",
                          }}
                        />
                      ))}
                    </span>
                    {theme.label}
                  </button>
                );
              })}
            </div>
          </Row>
        </div>
      </section>

      {/* ---- Help ---- */}
      <section className="mt-8">
        <h2 className="t-section">Help</h2>
        <div
          className="card mt-3 divide-y overflow-hidden"
          style={{ borderColor: "var(--line)" }}
        >
          <Row
            label="Something looks wrong"
            description="Tell us what happened and we will fix it."
          >
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(OPEN_FEEDBACK_EVENT))}
              className="btn btn-secondary btn-sm"
            >
              Send feedback
            </button>
          </Row>
          <Row
            label="Download your data"
            description="Everything AceDecks holds about you, as one file."
          >
            <button
              type="button"
              onClick={() => void exportData()}
              disabled={isExporting}
              className="btn btn-secondary btn-sm"
            >
              {isExporting ? "Preparing…" : "Download"}
            </button>
          </Row>
          {exportError && (
            <div className="px-4 py-3">
              <p className="t-meta" role="alert" style={{ color: "var(--danger)" }}>
                {exportError}
              </p>
            </div>
          )}
          <Row label="Privacy and terms">
            <div className="flex gap-2">
              <Link href="/privacy" className="btn btn-quiet btn-sm">
                Privacy
              </Link>
              <Link href="/terms" className="btn btn-quiet btn-sm">
                Terms
              </Link>
            </div>
          </Row>
        </div>
      </section>

      {/* ---- Everything else ---- */}
      <section className="mt-8">
        <h2 className="t-section">Everything else</h2>
        <p className="t-meta mt-1.5">
          Less-used corners of AceDecks. They all still work; they are just not
          worth a permanent place in the sidebar.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { href: "/diagnostics/history", label: "Past diagnostics" },
            { href: "/mastery-map", label: "Mastery map" },
            { href: "/curriculum", label: "Curriculum builder" },
            { href: "/clashrank", label: "ClashRank leaderboard" },
            { href: "/classroom", label: "Classroom" },
            { href: "/pricing", label: "Plans" },
          ].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="card-link px-4 py-3 text-[14px]">
                <span style={{ color: "var(--text-2)" }}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Sign out ---- */}
      <section className="mt-8">
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={isSigningOut}
          className="btn btn-secondary"
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </section>

      {/* ---- Delete account ----
          Deliberately last, quiet, and behind a typed confirmation. It is
          the one irreversible thing on this page. */}
      <section className="mt-12">
        <h2 className="t-section">Delete account</h2>
        {!isDeleteOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="t-meta flex-1 min-w-[16rem]">
              Permanently deletes your account, your study material, and your progress.
              This cannot be undone.
            </p>
            <button
              type="button"
              onClick={() => setIsDeleteOpen(true)}
              className="btn btn-sm btn-quiet"
              style={{ color: "var(--danger)" }}
            >
              Delete my account
            </button>
          </div>
        ) : (
          <div className="card mt-3 px-4 py-4" style={{ borderColor: "var(--danger)" }}>
            <p className="text-[15px] font-medium" style={{ color: "var(--text-1)" }}>
              This deletes everything, permanently.
            </p>
            <p className="t-meta mt-1">
              Your decks, questions, mastery history and progress are removed and cannot be
              recovered. If you have an Ace Pro subscription it is cancelled first, so you
              are not billed again.
            </p>
            <label htmlFor="delete-confirm" className="t-meta mt-4 block">
              Type <span style={{ color: "var(--text-1)" }}>DELETE</span> to confirm.
            </label>
            <input
              id="delete-confirm"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              autoComplete="off"
              className="field mt-2 max-w-[12rem]"
              placeholder="DELETE"
            />
            {deleteError && (
              <p className="t-meta mt-2" style={{ color: "var(--danger)" }} role="alert">
                {deleteError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={deleteConfirmation.trim() !== "DELETE" || isDeleting}
                className="btn btn-sm"
                style={{
                  background: "var(--danger)",
                  color: "#1a0708",
                  fontWeight: 600,
                }}
              >
                {isDeleting ? "Deleting…" : "Delete my account permanently"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteOpen(false);
                  setDeleteConfirmation("");
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="btn btn-sm btn-secondary"
              >
                Keep my account
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
