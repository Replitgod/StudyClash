"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Create", href: "/create" },
  { label: "Decks", href: "/decks" },
  { label: "Pricing", href: "/pricing" },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, isLoading } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    closeMobileMenu();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <nav className="sticky top-0 z-30 w-full border-b border-white/10 bg-[#05050a]/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          onClick={closeMobileMenu}
          className="flex-shrink-0 text-lg font-black tracking-tight"
        >
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            StudyClash
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                isActive(link.href)
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth section */}
        <div className="hidden items-center gap-2 md:flex">
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-white/5" />
          ) : isLoggedIn ? (
            <>
              <Link
                href="/account"
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                  isActive("/account")
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                Account
              </Link>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-bold text-white/80 transition-colors duration-150 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoggingOut ? "Logging Out..." : "Logout"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white/70 transition-colors duration-150 hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-bold text-white shadow-[0_0_20px_-8px_rgba(217,70,239,0.6)] transition-transform duration-200 hover:scale-[1.03] active:scale-95"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger button */}
        <button
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
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
                d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu panel */}
      {isMobileMenuOpen && (
        <div className="border-t border-white/10 bg-[#05050a]/95 px-4 py-4 backdrop-blur-md md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileMenu}
                className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                  isActive(link.href)
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                {link.label}
              </Link>
            ))}

            <div className="my-2 h-px bg-white/10" />

            {isLoading ? (
              <div className="h-11 w-full animate-pulse rounded-lg bg-white/5" />
            ) : isLoggedIn ? (
              <>
                <Link
                  href="/account"
                  onClick={closeMobileMenu}
                  className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                    isActive("/account")
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white/90"
                  }`}
                >
                  Account
                </Link>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-sm font-bold text-white/80 transition-colors duration-150 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoggingOut ? "Logging Out..." : "Logout"}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition-colors duration-150 hover:bg-white/10"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-[0_0_20px_-8px_rgba(217,70,239,0.6)] transition-transform duration-200 active:scale-95"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}