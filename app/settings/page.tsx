"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { OPEN_FEEDBACK_EVENT } from "@/lib/uiLayout";
import { FREE_PLAN_LIMIT_SUMMARY } from "@/lib/planLimits";
import { useTheme } from "@/lib/useTheme";
import { resolveTier } from "@/lib/tiers";

// Settings is deliberately boring. Nothing a student needs in order to
// study lives here -- it is name, account, data, and the way out.

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

  useEffect(() => {
    setName(profile?.display_name?.trim() || "");
  }, [profile?.display_name]);

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

          <Row label="Plan" description={FREE_PLAN_LIMIT_SUMMARY}>
            <div className="flex items-center gap-2">
              <span className="chip">{currentTier.label}</span>
              {currentTier.id === "free" && (
                <Link href="/pricing" className="btn btn-sm btn-secondary">
                  Upgrade
                </Link>
              )}
            </div>
          </Row>

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
    </div>
  );
}
