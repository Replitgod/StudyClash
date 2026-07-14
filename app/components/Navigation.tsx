"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { UI_SFX } from "@/lib/uiSound";
import { springSnappy } from "@/lib/motion";
import BattleAILink from "./BattleAILink";
import { UI_Z_INDEX } from "@/lib/uiLayout";

const CONTINUE_PATH_STORAGE_KEY = "studyjoust_last_path";
const CONTINUE_PATH_EXCLUDE = new Set([
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/contact",
]);

function VyraMiniIcon() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/35 bg-gradient-to-br from-cyan-400/25 to-emerald-500/20 shadow-[0_0_14px_-8px_rgba(34,211,238,0.8)]">
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="9" stroke="#67E8F9" strokeWidth="1.4" />
        <circle cx="9" cy="11" r="1.2" fill="#22D3EE" />
        <circle cx="15" cy="11" r="1.2" fill="#6EE7B7" />
        <path d="M9 14.3c1 .8 2 .8 3 .8s2 0 3-.8" stroke="#D1FAE5" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Battle AI", href: "/#battle-ai", isBattle: true },
  { label: "Demo", href: "/demo/battle" },
  { label: "Create", href: "/create" },
  { label: "Decks", href: "/decks", authOnly: true },
  { label: "Dashboard", href: "/dashboard", authOnly: true },
  { label: "Exams", href: "/exams" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Classroom", href: "/classroom" },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, isLoading } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [continuePath, setContinuePath] = useState<string | null>(null);

  const fullNavLinks = NAV_LINKS.filter((link) => {
    if (link.authOnly) return isLoggedIn;
    return true;
  });
  const navLinks = fullNavLinks;

  const isActive = (href: string) => {
    if (href.includes("#")) {
      const [base] = href.split("#");
      return pathname === (base || "/");
    }

    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => {
      const next = !prev;
      if (next) UI_SFX.menuOpen();
      else UI_SFX.menuClose();
      return next;
    });
  };

  useEffect(() => {
    if (!pathname) return;

    try {
      const saved = window.localStorage.getItem(CONTINUE_PATH_STORAGE_KEY);
      if (saved && saved !== pathname) {
        setContinuePath(saved);
      }

      if (pathname !== "/" && !CONTINUE_PATH_EXCLUDE.has(pathname)) {
        window.localStorage.setItem(CONTINUE_PATH_STORAGE_KEY, pathname);
      }
    } catch {
      // Ignore localStorage access issues.
    }
  }, [pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    closeMobileMenu();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <nav
      className="sticky top-0 w-full border-b border-white/10 bg-[#05050a]/80 backdrop-blur-md"
      style={{ zIndex: UI_Z_INDEX.stickyHeader }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          onClick={closeMobileMenu}
          className="flex flex-shrink-0 items-center gap-2 text-lg font-black tracking-tight"
        >
          <VyraMiniIcon />
          <span className="bg-gradient-to-r from-fuchsia-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            StudyJoust
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            link.isBattle ? (
              <BattleAILink
                key={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                  isActive(link.href)
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                {link.label}
              </BattleAILink>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                  isActive(link.href)
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                {link.label}
              </Link>
            )
          ))}
        </div>

        {/* Desktop auth section */}
        <div className="hidden items-center gap-2 md:flex">
          <BattleAILink
            className="rounded-lg bg-gradient-to-r from-cyan-300 to-emerald-300 px-3 py-2 text-sm font-black text-[#052538] shadow-[0_0_22px_-8px_rgba(34,211,238,0.8)] transition-transform duration-200 hover:scale-[1.03] active:scale-95"
          >
            Battle AI Now
          </BattleAILink>
          <Link
            href={isLoggedIn ? "/create" : "/signup?redirect=/create"}
            className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-100 transition-colors duration-150 hover:border-cyan-300/45 hover:bg-cyan-500/20"
          >
            Create Deck
          </Link>
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse rounded-lg bg-white/5" />
          ) : isLoggedIn ? (
            <>
              {continuePath && (
                <Link
                  href={continuePath}
                  className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition-colors duration-150 hover:border-cyan-300/40 hover:bg-cyan-500/20"
                >
                  Continue
                </Link>
              )}
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
          onClick={toggleMobileMenu}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
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
      <AnimatePresence>
      {isMobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springSnappy}
          className="border-t border-white/10 bg-[#05050a]/95 px-4 py-4 backdrop-blur-md md:hidden">
          <div className="flex flex-col gap-1">
            <BattleAILink
              onClick={closeMobileMenu}
              className="mb-2 flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-3 py-3 text-sm font-black text-[#052538]"
            >
              Battle AI Now
            </BattleAILink>

            <Link
              href={isLoggedIn ? "/create" : "/signup?redirect=/create"}
              onClick={closeMobileMenu}
              className="mb-2 flex items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-3 text-sm font-bold text-cyan-100"
            >
              Create Deck
            </Link>

            {navLinks.map((link) => (
              link.isBattle ? (
                <BattleAILink
                  key={link.href}
                  onClick={closeMobileMenu}
                  className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                    isActive(link.href)
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white/90"
                  }`}
                >
                  {link.label}
                </BattleAILink>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobileMenu}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                    isActive(link.href)
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white/90"
                  }`}
                >
                  {link.label}
                </Link>
              )
            ))}

            <div className="my-2 h-px bg-white/10" />

            {isLoading ? (
              <div className="h-11 w-full animate-pulse rounded-lg bg-white/5" />
            ) : isLoggedIn ? (
              <>
                {continuePath && (
                  <Link
                    href={continuePath}
                    onClick={closeMobileMenu}
                    className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-3 text-sm font-semibold text-cyan-100"
                  >
                    Continue where you left off
                  </Link>
                )}
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
        </motion.div>
      )}
      </AnimatePresence>
    </nav>
  );
}