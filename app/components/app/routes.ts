// Where every route in AcedIQ lives, in one place.
//
// The app has exactly four primary destinations. Everything else is either
// a detail screen inside one of them, a distraction-free focus screen, or a
// public/marketing page. Nothing else gets navigation.

export type NavId = "home" | "library" | "practice" | "vyra";

export const NAV_ITEMS: Array<{
  id: NavId;
  label: string;
  href: string;
  /** Sub-paths that should also light this item up. */
  match: string[];
}> = [
  { id: "home", label: "Home", href: "/home", match: ["/home"] },
  { id: "library", label: "Library", href: "/library", match: ["/library", "/curriculum"] },
  {
    id: "practice",
    label: "Practice",
    href: "/practice",
    match: ["/practice", "/mastery-map", "/study-plans", "/diagnostics", "/exams", "/clashrank"],
  },
  { id: "vyra", label: "Vyra", href: "/vyra", match: ["/vyra"] },
];

// Screens that deliberately render with no chrome at all: a study session,
// a timed diagnostic, a live tournament. Nothing should compete with the
// question on screen.
const FOCUS_PREFIXES = [
  "/study/",
  "/battle/",
  "/results/",
  "/diagnostics/attempt/",
  "/tournament/",
  "/demo/battle",
  "/challenge/",
];

// Public pages, which keep the marketing header instead of the app sidebar.
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/signup",
  "/pricing",
  "/privacy",
  "/terms",
  "/contact",
]);

const PUBLIC_PREFIXES = ["/demo", "/classroom/join", "/admin"];

export type Chrome = "app" | "focus" | "public";

export function chromeFor(pathname: string | null): Chrome {
  if (!pathname) return "public";
  if (FOCUS_PREFIXES.some((p) => pathname.startsWith(p))) return "focus";
  if (PUBLIC_EXACT.has(pathname)) return "public";
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "public";
  }
  return "app";
}

export function activeNavId(pathname: string | null): NavId | null {
  if (!pathname) return null;
  for (const item of NAV_ITEMS) {
    if (item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))) {
      return item.id;
    }
  }
  return null;
}
