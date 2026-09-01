"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { UI_Z_INDEX } from "@/lib/uiLayout";
import { LogoMark } from "@/app/components/brand/Logo";
import { Sparkles } from "lucide-react";

// Public / marketing header only.
//
// The signed-in application has its own chrome (a four-item sidebar and a
// four-item mobile tab bar, see app/components/app/AppFrame.tsx). This used
// to be a single component trying to be both at once -- a hover-expand icon
// rail, a "More" popover holding seven overflow links, a mobile hamburger
// sheet duplicating all of them -- which is exactly the "what am I supposed
// to click?" problem the redesign set out to remove. It is now just the bar
// a logged-out visitor sees.

export function isActiveBattleRoute(pathname: string | null): boolean {
  return !!pathname && /^\/battle\/[^/]+/.test(pathname);
}

const LINKS = [
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
];

export default function Navigation() {
  const pathname = usePathname();
  const { isLoggedIn, isLoading } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (isActiveBattleRoute(pathname)) return null;

  const close = () => setIsMenuOpen(false);

  return (
    <header
      className="sticky top-0 w-full border-b"
      style={{
        zIndex: UI_Z_INDEX.stickyHeader,
        borderColor: "var(--line)",
        background: "color-mix(in srgb, var(--app-bg) 85%, transparent)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link
          href="/"
          onClick={close}
          className="flex flex-shrink-0 items-center gap-2.5"
        >
          <LogoMark className="h-8 w-8" idPrefix="nav" title="AceDecks" />
        </Link>

        {/* Offer pill. Hidden below lg: on a narrow bar it crowds out the
            links it is meant to sit beside. */}
        <span
          className="ml-6 hidden items-center gap-2 rounded-full px-3 py-1.5 lg:inline-flex"
          style={{
            border: "1px solid var(--accent-line)",
            background: "var(--accent-soft)",
          }}
        >
          <Sparkles className="h-3 w-3" style={{ color: "var(--accent)" }} aria-hidden="true" />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--accent-bright)" }}
          >
            {/* Not "Unlimited" -- that was true before tiers landed and is
                not now: the free plan caps at 3 knowledge maps a month and 5
                cards per concept (lib/tiers.ts). Promising unlimited in the
                header while the pricing page and the hero both say "3 maps a
                month" is the kind of contradiction a student notices at
                exactly the wrong moment. */}
            Free to start · No card
          </span>
        </span>

        <nav aria-label="Site" className="ml-auto hidden items-center gap-1 sm:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-[14px] font-medium transition-colors hover:bg-[var(--panel-raised)]"
              style={{ color: "var(--text-2)" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {isLoading ? null : isLoggedIn ? (
            <Link href="/home" className="btn btn-accent btn-sm">
              Open AceDecks
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-2 text-[14px] font-medium transition-colors hover:bg-[var(--panel-raised)] sm:inline-flex"
                style={{ color: "var(--text-2)" }}
              >
                Log in
              </Link>
              <Link href="/signup" className="btn btn-accent btn-sm">
                Start free
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label="Menu"
            aria-expanded={isMenuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-lg sm:hidden"
            style={{ color: "var(--text-2)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5">
              {isMenuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div
          className="border-t px-4 py-2 sm:hidden"
          style={{ borderColor: "var(--line)", background: "var(--app-bg)" }}
        >
          {[...LINKS, ...(isLoggedIn ? [] : [{ label: "Log in", href: "/login" }])].map(
            (link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="block rounded-lg px-3 py-3 text-[15px] font-medium"
                style={{ color: "var(--text-2)" }}
              >
                {link.label}
              </Link>
            )
          )}
        </div>
      )}
    </header>
  );
}
