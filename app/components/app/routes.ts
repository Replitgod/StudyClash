// Where every route in AceDecks lives, in one place.
//
// The app has five primary destinations. Everything else is either a detail
// screen inside one of them, a distraction-free focus screen, or a
// public/marketing page. Nothing else gets navigation.
//
// It was four for a long time, and Exam prep was the fifth thing that earned
// its place rather than being added because it existed. While /exams was a
// set of cards whose buttons went to the topic composer, burying it under
// Practice was correct -- it was not a destination, it was a detour. It now
// holds several hundred original questions across five exams and is the
// reason a lot of people would pay for this, and a student cannot choose a
// product they cannot find.

export type NavId = "home" | "library" | "practice" | "exams" | "vyra";

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
    match: [
      "/practice",
      "/mastery-map",
      "/study-plans",
      "/clashrank",
      "/friends",
    ],
  },
  {
    id: "exams",
    label: "Exams",
    href: "/exams",
    // /diagnostics is the attempt machinery behind /exams -- the timed
    // sitting, the results, the history. A student in the middle of one is
    // still in Exams, and the nav should say so rather than going dark.
    match: ["/exams", "/diagnostics"],
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
