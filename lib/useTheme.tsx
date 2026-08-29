"use client";

import { useCallback, useEffect, useState } from "react";
import { applyTheme, resolveTheme, THEME_LIST, type Theme, type ThemeId } from "@/lib/themes";
import { evaluateRequest, type TierId } from "@/lib/tiers";

const STORAGE_KEY = "acedecks.theme";

// Applies and persists the workspace theme.
//
// Persisted to localStorage rather than only to the profile so the theme
// survives a reload before auth resolves. Without that the app paints in
// the default palette and then snaps to the chosen one a beat later, which
// is worse than not offering themes at all.
//
// Custom themes are a paid feature (see lib/tiers.ts). The gate is applied
// on read as well as on write: a student who chose a theme on Pro and then
// lapsed should fall back to the default rather than keeping a feature they
// are no longer paying for -- and should not silently lose their stored
// preference either, so it is kept and simply not applied.

export function useTheme(tier: TierId | string | null | undefined) {
  const [themeId, setThemeId] = useState<ThemeId>("acedecks");
  const [isLocked, setIsLocked] = useState(false);

  const allowed = evaluateRequest({
    tier,
    action: "set_theme",
    usage: { mapsThisMonth: 0 },
  }).actionAllowed;

  // Load and apply.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing, or storage disabled. The default theme is a fine
      // answer; a thrown error here would take the whole app down.
      stored = null;
    }

    const wanted = resolveTheme(stored);
    const effective = allowed ? wanted : resolveTheme(null);

    setThemeId(wanted.id);
    setIsLocked(!allowed && wanted.id !== "acedecks");
    applyTheme(effective, document.documentElement);
  }, [allowed]);

  const setTheme = useCallback(
    (next: ThemeId) => {
      const theme = resolveTheme(next);
      setThemeId(theme.id);

      try {
        window.localStorage.setItem(STORAGE_KEY, theme.id);
      } catch {
        // Preference is lost on reload but the session still themes.
      }

      if (allowed) {
        applyTheme(theme, document.documentElement);
        setIsLocked(false);
      } else {
        setIsLocked(theme.id !== "acedecks");
      }
    },
    [allowed]
  );

  return {
    themeId,
    themes: THEME_LIST as Theme[],
    setTheme,
    /** True when a theme is chosen but the tier cannot apply it. */
    isLocked,
    canUseThemes: allowed,
  };
}
