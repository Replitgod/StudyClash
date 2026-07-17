"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { authFetch } from "@/lib/authFetch";

const NAV_ITEMS = [
  { href: "/admin/marketing", label: "Dashboard", exact: true },
  { href: "/admin/marketing/campaigns", label: "Campaigns" },
  { href: "/admin/marketing/destinations", label: "Destinations" },
  { href: "/admin/marketing/drafts", label: "Draft Review" },
  { href: "/admin/marketing/history", label: "Posting History" },
  { href: "/admin/marketing/analytics", label: "Analytics" },
  { href: "/admin/marketing/settings", label: "Settings" },
];

// This layout is the ONLY client-side gate this app can offer -- there's no
// server-side session cookie to check in Next.js middleware (StudyClash
// auth is Bearer-token/localStorage based, see lib/authFetch.ts), so a
// non-admin who loads this page shell sees an empty "Checking access..."
// state and nothing else. The REAL security boundary is server-side: every
// single API route under /api/admin/marketing/* independently calls
// requireAdminUser() and returns 403 to anyone not in ADMIN_EMAILS,
// regardless of what this client-side check does. A non-admin literally
// cannot retrieve any marketing data no matter how they manipulate the
// client -- this gate only controls whether the (data-less) page shell
// renders, not whether any data is reachable.
export default function MarketingAdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading: isAuthLoading } = useAuth();
  const pathname = usePathname();
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "denied">("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!isLoggedIn) {
      setAccessState("denied");
      setErrorMessage("Sign in with an admin account to view this page.");
      return;
    }

    let cancelled = false;
    authFetch("/api/admin/marketing/whoami")
      .then(async (response) => {
        if (cancelled) return;
        const json = await response.json().catch(() => ({}));
        if (response.ok && json.isAdmin) {
          setAccessState("allowed");
        } else {
          setAccessState("denied");
          setErrorMessage(json.error || "You do not have admin access.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAccessState("denied");
        setErrorMessage("Could not verify admin access.");
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, isAuthLoading]);

  if (accessState !== "allowed") {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#05050a] px-4 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          {accessState === "checking" ? (
            <>
              <svg className="mx-auto h-8 w-8 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              <p className="mt-4 text-sm text-white/50">Checking access...</p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold text-red-300">Access Denied</h1>
              <p className="mt-2 text-sm text-red-200/80">{errorMessage}</p>
              <Link
                href="/"
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-bold text-white/80 hover:bg-white/10"
              >
                Back to StudyClash
              </Link>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh w-full bg-[#05050a] text-white">
      <aside className="hidden w-56 flex-shrink-0 border-r border-white/10 bg-black/30 md:block">
        <div className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">Private</p>
          <p className="mt-1 text-sm font-black">Marketing Dashboard</p>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                  isActive ? "bg-indigo-500/15 text-indigo-200" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-white/10 bg-black/20 px-4 py-2 md:hidden">
          <nav className="flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    isActive ? "bg-indigo-500/15 text-indigo-200" : "text-white/60"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
