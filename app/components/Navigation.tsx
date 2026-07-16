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

// Links that don't have a dedicated slot in the app rail/mobile bar --
// surfaced through the "More" popover on desktop and inline in the mobile
// menu, same as before this component had a rail at all.
const MORE_LINKS = [
  { label: "Create Deck", href: "/create" },
  { label: "Demo", href: "/demo/battle" },
  { label: "Exams", href: "/exams" },
  { label: "Pricing", href: "/pricing" },
  { label: "Classroom", href: "/classroom" },
  { label: "Contact", href: "/contact" },
];

// Marketing/logged-out nav, unchanged in structure from before -- only its
// brand colors moved from fuchsia/violet to indigo.
const MARKETING_LINKS = [
  { label: "Home", href: "/" },
  { label: "Battle AI", href: "/#battle-ai", isBattle: true },
  { label: "Demo", href: "/demo/battle" },
  { label: "Create", href: "/create" },
  { label: "Diagnostics", href: "/diagnostics" },
  { label: "Exams", href: "/exams" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Classroom", href: "/classroom" },
];

function VyraMiniIcon() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-indigo-300/35 bg-gradient-to-br from-indigo-400/25 to-green-500/20 shadow-[0_0_14px_-8px_rgba(79,70,229,0.8)]">
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

const RAIL_ICONS: Record<string, React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[19px] w-[19px]">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  battle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[19px] w-[19px]">
      <path d="M13 2 L4 14h6l-1 8 9-12h-6z" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[19px] w-[19px]">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  decks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[19px] w-[19px]">
      <path d="M4 19V5a2 2 0 0 1 2-2h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M14 3v6h6" />
    </svg>
  ),
  diagnostics: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[19px] w-[19px]">
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 16l9 5 9-5M3 12l9 5 9-5" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[17px] w-[17px]">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[19px] w-[19px]">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.6-3.6 5-5.5 7.5-5.5s5.9 1.9 7.5 5.5" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[17px] w-[17px]">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  login: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[17px] w-[17px]">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5M15 12H3" />
    </svg>
  ),
  signup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[19px] w-[19px]">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c1.4-3.2 4.4-5 7-5" />
      <path d="M18 8v6M15 11h6" strokeLinecap="round" />
    </svg>
  ),
};

// A single rail entry. Collapsed (the rail's resting state) it's a
// centered icon with a floating tooltip on individual hover; once the whole
// rail is expanded (see Navigation's isRailOpen), every item switches to an
// icon + inline label row instead -- the tooltip would be redundant once
// the label is already sitting right there.
function RailButton({
  icon,
  tip,
  active,
  href,
  onClick,
  as,
  expanded,
}: {
  icon: React.ReactNode;
  tip: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  as?: "battle";
  expanded: boolean;
}) {
  const className = `group relative flex flex-shrink-0 items-center rounded-xl border border-transparent transition-colors duration-150 ${
    expanded ? "w-full justify-start gap-3 px-4 py-2.5" : "mx-auto w-14 flex-col justify-center gap-1 py-2.5"
  } ${active ? "text-indigo-400" : "text-white/50 hover:text-white"}`;

  const tooltip = !expanded && (
    <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-lg border border-white/10 bg-[#131316] px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-all duration-150 delay-0 group-hover:translate-x-0 group-hover:opacity-100 group-hover:delay-300">
      {tip}
    </span>
  );

  const inner = (
    <>
      <motion.span
        className="flex-shrink-0"
        whileHover={{ scale: 1.08, y: -1 }}
        whileTap={{ scale: 0.92 }}
        transition={springSnappy}
      >
        {icon}
      </motion.span>
      <AnimatePresence>
        {expanded && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            className="whitespace-nowrap text-sm font-semibold"
          >
            {tip}
          </motion.span>
        )}
      </AnimatePresence>
      {tooltip}
    </>
  );

  if (as === "battle") {
    return (
      <BattleAILink className={className} onClick={onClick} ariaLabel={tip}>
        {inner}
      </BattleAILink>
    );
  }

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className} aria-label={tip}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={tip}>
      {inner}
    </button>
  );
}

// An active battle is the one screen that wants zero competing chrome --
// see the "BATTLE SCREEN" spec ("Remove the standard website navigation
// during an active battle"). MainContentShell checks this too, so the
// rail's reserved gutter disappears along with the rail itself.
export function isActiveBattleRoute(pathname: string | null): boolean {
  return !!pathname && /^\/battle\/[^/]+/.test(pathname);
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, isLoading } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [continuePath, setContinuePath] = useState<string | null>(null);
  const [isRailOpen, setIsRailOpen] = useState(false);

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
      if (saved && saved !== pathname) setContinuePath(saved);
      if (pathname !== "/" && !CONTINUE_PATH_EXCLUDE.has(pathname)) {
        window.localStorage.setItem(CONTINUE_PATH_STORAGE_KEY, pathname);
      }
    } catch {
      // Ignore localStorage access issues.
    }
  }, [pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMoreOpen(false);
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
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    closeMobileMenu();
    setIsMoreOpen(false);
    await supabase.auth.signOut();
    router.push("/");
  };

  if (isActiveBattleRoute(pathname)) return null;

  const homeHref = isLoggedIn ? "/dashboard" : "/";

  // ---- Desktop app shell: fixed left icon rail, always -- logged in or
  // not. Mobile keeps its own top bar (see MobileTopBar) since a hover-
  // expand side rail isn't a touch-friendly pattern on a narrow viewport. ----
  return (
    <>
      <motion.nav
        initial={false}
        animate={{ width: isRailOpen ? 232 : 72 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        style={{ zIndex: UI_Z_INDEX.stickyHeader }}
        className="fixed left-0 top-0 hidden h-screen flex-col overflow-hidden border-r border-white/10 bg-[#0a0a0c] py-5 shadow-2xl md:flex"
        aria-label="Primary"
        onMouseEnter={() => setIsRailOpen(true)}
        onMouseLeave={() => {
          setIsRailOpen(false);
          setIsMoreOpen(false);
        }}
      >
        <Link href={homeHref} className="mx-auto mb-5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-black text-white">
          S
        </Link>

        <RailButton icon={RAIL_ICONS.home} tip="Home" href={homeHref} active={isActive(homeHref)} expanded={isRailOpen} />
        <RailButton icon={RAIL_ICONS.battle} tip="Battle" as="battle" active={isActive("/#battle-ai")} expanded={isRailOpen} />
        <RailButton icon={RAIL_ICONS.plan} tip="Study Plan" href="/study-plans/new" active={isActive("/study-plans")} expanded={isRailOpen} />
        <RailButton icon={RAIL_ICONS.decks} tip="Decks" href="/decks" active={isActive("/decks")} expanded={isRailOpen} />
        <RailButton icon={RAIL_ICONS.diagnostics} tip="Diagnostics" href="/diagnostics" active={isActive("/diagnostics")} expanded={isRailOpen} />

        <div className="mt-auto flex flex-col gap-1">
          <div className="relative">
            <RailButton
              icon={RAIL_ICONS.more}
              tip="More"
              active={isMoreOpen}
              onClick={() => setIsMoreOpen((v) => !v)}
              expanded={isRailOpen}
            />
            <AnimatePresence>
              {isMoreOpen && (
                <motion.div
                  initial={{ opacity: 0, x: -6, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -6, scale: 0.97 }}
                  transition={springSnappy}
                  className="absolute bottom-0 left-full ml-2.5 w-52 rounded-xl border border-white/10 bg-[#131316] p-1.5 shadow-2xl"
                  style={{ zIndex: UI_Z_INDEX.stickyHeader }}
                >
                  {continuePath && (
                    <Link
                      href={continuePath}
                      onClick={() => setIsMoreOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm font-semibold text-indigo-300 hover:bg-white/5"
                    >
                      Continue where you left off
                    </Link>
                  )}
                  {MORE_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMoreOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {isLoading ? (
            <div className="mx-auto h-8 w-8 animate-pulse rounded-lg bg-white/5" />
          ) : isLoggedIn ? (
            <>
              <RailButton icon={RAIL_ICONS.account} tip="Account" href="/account" active={isActive("/account")} expanded={isRailOpen} />
              <RailButton
                icon={RAIL_ICONS.logout}
                tip={isLoggingOut ? "Logging out…" : "Logout"}
                onClick={handleLogout}
                active={false}
                expanded={isRailOpen}
              />
            </>
          ) : (
            <>
              <RailButton icon={RAIL_ICONS.login} tip="Login" href="/login" active={isActive("/login")} expanded={isRailOpen} />
              <RailButton icon={RAIL_ICONS.signup} tip="Sign Up" href="/signup" active={isActive("/signup")} expanded={isRailOpen} />
            </>
          )}
        </div>
      </motion.nav>

      <MobileTopBar
        isLoggedIn={isLoggedIn}
        isLoading={isLoading}
        isLoggingOut={isLoggingOut}
        isMobileMenuOpen={isMobileMenuOpen}
        toggleMobileMenu={toggleMobileMenu}
        closeMobileMenu={closeMobileMenu}
        handleLogout={handleLogout}
        continuePath={continuePath}
        isActive={isActive}
      />
    </>
  );
}

function MobileTopBar({
  isLoggedIn,
  isLoading,
  isLoggingOut,
  isMobileMenuOpen,
  toggleMobileMenu,
  closeMobileMenu,
  handleLogout,
  continuePath,
  isActive,
}: {
  isLoggedIn: boolean;
  isLoading: boolean;
  isLoggingOut: boolean;
  isMobileMenuOpen: boolean;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  handleLogout: () => void;
  continuePath: string | null;
  isActive: (href: string) => boolean;
}) {
  const navLinks = MARKETING_LINKS;

  return (
    <nav
      className="sticky top-0 w-full border-b border-white/10 bg-[#05050a]/80 backdrop-blur-md md:hidden"
      style={{ zIndex: UI_Z_INDEX.stickyHeader }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        <Link href="/" onClick={closeMobileMenu} className="flex flex-shrink-0 items-center gap-2 text-lg font-black tracking-tight">
          <VyraMiniIcon />
          <span className="bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-400 bg-clip-text text-transparent">
            StudyClash
          </span>
        </Link>

        <button
          onClick={toggleMobileMenu}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white md:hidden"
          aria-label="Toggle menu"
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springSnappy}
            className="border-t border-white/10 bg-[#05050a]/95 px-4 py-4 backdrop-blur-md md:hidden"
          >
            <div className="flex flex-col gap-1">
              <BattleAILink onClick={closeMobileMenu} className="mb-2 flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-3 text-sm font-black text-white">
                Battle AI Now
              </BattleAILink>

              <Link
                href={isLoggedIn ? "/create" : "/signup?redirect=/create"}
                onClick={closeMobileMenu}
                className="mb-2 flex items-center justify-center rounded-xl border border-indigo-400/25 bg-indigo-500/10 px-3 py-3 text-sm font-bold text-indigo-100"
              >
                Create Deck
              </Link>

              {isLoggedIn && (
                <>
                  <Link
                    href="/dashboard"
                    onClick={closeMobileMenu}
                    className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                      isActive("/dashboard") ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                    }`}
                  >
                    Home
                  </Link>
                  <Link
                    href="/study-plans/new"
                    onClick={closeMobileMenu}
                    className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                      isActive("/study-plans") ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                    }`}
                  >
                    Study Plan
                  </Link>
                  <Link
                    href="/decks"
                    onClick={closeMobileMenu}
                    className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                      isActive("/decks") ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                    }`}
                  >
                    Decks
                  </Link>
                </>
              )}

              {navLinks.map((link) =>
                link.isBattle ? (
                  <BattleAILink
                    key={link.href}
                    onClick={closeMobileMenu}
                    className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                      isActive(link.href) ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
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
                      isActive(link.href) ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              )}

              <div className="my-2 h-px bg-white/10" />

              {isLoading ? (
                <div className="h-11 w-full animate-pulse rounded-lg bg-white/5" />
              ) : isLoggedIn ? (
                <>
                  {continuePath && (
                    <Link
                      href={continuePath}
                      onClick={closeMobileMenu}
                      className="rounded-lg border border-indigo-400/25 bg-indigo-500/10 px-3 py-3 text-sm font-semibold text-indigo-100"
                    >
                      Continue where you left off
                    </Link>
                  )}
                  <Link
                    href="/account"
                    onClick={closeMobileMenu}
                    className={`rounded-lg px-3 py-3 text-sm font-semibold transition-colors duration-150 ${
                      isActive("/account") ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90"
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
                    className="flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-colors duration-150 active:scale-95"
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
