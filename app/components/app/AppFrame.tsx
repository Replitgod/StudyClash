"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { StudyProvider } from "@/lib/useStudy";
import Navigation from "@/app/components/Navigation";
import { LogoMark, Wordmark } from "@/app/components/brand/Logo";
import { CommandMenu, OPEN_COMMAND_MENU_EVENT } from "@/app/components/CommandMenu";
import { activeNavId, chromeFor, NAV_ITEMS } from "./routes";
import {
  HomeIcon,
  LibraryIcon,
  PracticeIcon,
  SearchIcon,
  SettingsIcon,
  VyraIcon,
} from "./Icons";

const NAV_ICONS = {
  home: HomeIcon,
  library: LibraryIcon,
  practice: PracticeIcon,
  vyra: VyraIcon,
} as const;

function openSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_MENU_EVENT));
}

// The app shell shows the real mark. `idPrefix` differs per call site
// because the sidebar and the mobile bar can both be mounted at once and
// SVG gradient ids are document-global.
function Logo({ className = "", idPrefix }: { className?: string; idPrefix?: string }) {
  return <LogoMark className={`h-8 w-8 flex-none ${className}`} idPrefix={idPrefix} />;
}

/* ---------------------------------------------------------------- sidebar */

function Sidebar({ pathname }: { pathname: string }) {
  const active = activeNavId(pathname);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r px-3 py-4 md:flex"
      style={{ borderColor: "var(--line)", background: "var(--app-bg)" }}
    >
      <Link
        href="/home"
        className="mb-6 flex items-center gap-2.5 rounded-lg px-2 py-1.5"
      >
        <Logo idPrefix="side" />
        <Wordmark className="text-[17px]" />
      </Link>

      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.id];
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors"
                style={{
                  color: isActive ? "var(--text-1)" : "var(--text-2)",
                  background: isActive ? "var(--panel-raised)" : "transparent",
                }}
              >
                <Icon className="h-[18px] w-[18px] flex-none" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        <button
          type="button"
          onClick={openSearch}
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] font-medium transition-colors hover:bg-[var(--panel-raised)]"
          style={{ color: "var(--text-2)" }}
        >
          <SearchIcon className="h-[18px] w-[18px] flex-none" />
          Search
          <kbd
            className="ml-auto rounded border px-1.5 py-0.5 text-[10px] font-medium"
            style={{ borderColor: "var(--line)", color: "var(--text-4)" }}
          >
            ⌘K
          </kbd>
        </button>

        <Link
          href="/settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors hover:bg-[var(--panel-raised)]"
          style={{
            color: pathname.startsWith("/settings") ? "var(--text-1)" : "var(--text-2)",
            background: pathname.startsWith("/settings") ? "var(--panel-raised)" : "transparent",
          }}
        >
          <SettingsIcon className="h-[18px] w-[18px] flex-none" />
          Settings
        </Link>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------- mobile nav */

function MobileTopBar() {
  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 md:hidden"
      style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--app-bg) 88%, transparent)", backdropFilter: "blur(12px)" }}
    >
      <Link href="/home" className="flex items-center gap-2">
        <Logo idPrefix="mob" />
        <Wordmark className="text-[17px]" />
      </Link>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search"
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ color: "var(--text-2)" }}
        >
          <SearchIcon className="h-[19px] w-[19px]" />
        </button>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ color: "var(--text-2)" }}
        >
          <SettingsIcon className="h-[19px] w-[19px]" />
        </Link>
      </div>
    </header>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  const active = activeNavId(pathname);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
      style={{
        borderColor: "var(--line)",
        background: "color-mix(in srgb, var(--app-bg) 92%, transparent)",
        backdropFilter: "blur(16px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.id];
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="flex h-16 flex-col items-center justify-center gap-1"
                style={{ color: isActive ? "var(--brand-text)" : "var(--text-3)" }}
              >
                <Icon className="h-[21px] w-[21px]" />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ frame */

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { isLoggedIn, isLoading } = useAuth();
  const chrome = chromeFor(pathname);

  // A study session, a timed test, a live tournament: no chrome at all.
  //
  // Still inside StudyProvider, though. "No chrome" is a layout decision, not
  // a data one: StudySession reads the shared snapshot to order questions by
  // topic mastery, and calls refresh() when a session is saved so Home and
  // Practice reflect the new numbers. Outside the provider both degrade
  // silently -- useStudy() hands back an empty snapshot and a no-op refresh --
  // so sessions lost their weak-topic ordering and finished work did not show
  // up until a hard reload. The provider is auth-aware and no-ops for signed-
  // out visitors, so mounting it here costs nothing.
  if (chrome === "focus") {
    return (
      <StudyProvider>
        <div id="main-content">{children}</div>
      </StudyProvider>
    );
  }

  // Public pages keep the marketing header.
  if (chrome === "public") {
    return (
      <>
        <Navigation />
        <div id="main-content">{children}</div>
      </>
    );
  }

  // Signed-out visitors who land on an app route get the marketing header
  // rather than an app sidebar whose destinations they cannot reach yet.
  if (!isLoggedIn && !isLoading) {
    return (
      <>
        <Navigation />
        <div id="main-content">{children}</div>
      </>
    );
  }

  return (
    <StudyProvider>
      <Sidebar pathname={pathname} />
      <MobileTopBar />
      <div id="main-content" className="md:pl-[232px]">
        <div className="pb-16 md:pb-0">{children}</div>
      </div>
      <MobileTabBar pathname={pathname} />
      <CommandMenu />
    </StudyProvider>
  );
}
