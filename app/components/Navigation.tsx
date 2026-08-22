"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { UI_Z_INDEX } from "@/lib/uiLayout";

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
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] text-[13px] font-bold text-white"
            style={{ background: "var(--brand)" }}
            aria-hidden="true"
          >
            A
          </span>
          <span
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--text-1)" }}
          >
            AcedIQ
          </span>
        </Link>

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
            <Link href="/home" className="btn btn-primary btn-sm">
              Open AcedIQ
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
              <Link href="/signup" className="btn btn-primary btn-sm">
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
