// The three flagship workspace themes.
//
// Each is a complete token set, not a hue swap: a light theme needs
// different text ramps, different line opacities and a different shadow
// model than a dark one, and half-converting produces grey-on-grey text
// that passes a glance and fails a contrast check.
//
// Applied by writing CSS custom properties onto the document root, so a
// theme change costs one style recalculation and no re-render. The token
// names are exactly the ones the app already uses (`--void`, `--text-1`,
// `--accent`, …), which is what lets a theme reach every screen without
// any component knowing themes exist.

export type ThemeId = "acedecks" | "dark_academia" | "tokyo_midnight" | "minimalist_matcha";

export type Theme = {
  id: ThemeId;
  label: string;
  description: string;
  /** True for a light canvas, which flips shadows and line opacities. */
  light: boolean;
  /** Swatches for the theme picker, dark-to-light. */
  swatches: [string, string, string];
  tokens: Record<string, string>;
};

/**
 * The default. Kept as a theme rather than as "no theme" so the picker has
 * something to return to and so every surface reads from one mechanism.
 */
const ACEDECKS: Theme = {
  id: "acedecks",
  label: "AceDecks",
  description: "Obsidian and indigo. The default.",
  light: false,
  swatches: ["#050506", "#6e56cf", "#8b7bf0"],
  tokens: {
    "--void": "#050506",
    "--void-raised": "#0a0a0c",
    "--app-bg": "#050506",
    "--panel": "#0d0d10",
    "--panel-raised": "#141417",
    "--panel-hover": "#1b1b1f",
    "--text-1": "#eef4fb",
    "--text-2": "#a3b1c6",
    "--text-3": "#6c7c95",
    "--text-4": "#48566d",
    "--line": "rgb(255 255 255 / 0.07)",
    "--line-strong": "rgb(255 255 255 / 0.14)",
    "--accent": "#6e56cf",
    "--accent-bright": "#8b7bf0",
    "--accent-dim": "#5842ab",
    "--accent-soft": "rgb(124 106 240 / 0.14)",
    "--accent-line": "rgb(124 106 240 / 0.34)",
    "--ok": "#34e39b",
    "--warn": "#ffb020",
    "--bad": "#f43f5e",
  },
};

const DARK_ACADEMIA: Theme = {
  id: "dark_academia",
  label: "Dark Academia",
  description: "Sepia, warm ink, and old paper.",
  light: false,
  swatches: ["#17120c", "#c9a227", "#e8dcc0"],
  tokens: {
    "--void": "#17120c",
    "--void-raised": "#1e1811",
    "--app-bg": "#17120c",
    "--panel": "#211a12",
    "--panel-raised": "#2a2118",
    "--panel-hover": "#332920",
    // Warm off-white rather than pure white: on a sepia ground, #fff reads
    // as a hole punched in the page.
    "--text-1": "#f0e6d2",
    "--text-2": "#c9b997",
    "--text-3": "#9a8a6f",
    "--text-4": "#6f6047",
    "--line": "rgb(233 220 192 / 0.1)",
    "--line-strong": "rgb(233 220 192 / 0.2)",
    "--accent": "#c9a227",
    "--accent-bright": "#e3bd4a",
    "--accent-dim": "#9a7c1c",
    "--accent-soft": "rgb(201 162 39 / 0.14)",
    "--accent-line": "rgb(201 162 39 / 0.36)",
    "--ok": "#8fae6b",
    "--warn": "#d9963f",
    "--bad": "#bf5b4b",
  },
};

const TOKYO_MIDNIGHT: Theme = {
  id: "tokyo_midnight",
  label: "Tokyo Midnight",
  description: "Neon teal and magenta on true black.",
  light: false,
  swatches: ["#000000", "#00e5c0", "#ff2d92"],
  tokens: {
    "--void": "#000000",
    "--void-raised": "#050508",
    "--app-bg": "#000000",
    "--panel": "#08080d",
    "--panel-raised": "#0f0f16",
    "--panel-hover": "#16161f",
    "--text-1": "#eafcff",
    "--text-2": "#9fb6c0",
    "--text-3": "#69808c",
    "--text-4": "#455a66",
    "--line": "rgb(0 229 192 / 0.1)",
    "--line-strong": "rgb(0 229 192 / 0.2)",
    "--accent": "#00e5c0",
    "--accent-bright": "#4dfadb",
    "--accent-dim": "#00a88c",
    "--accent-soft": "rgb(0 229 192 / 0.12)",
    "--accent-line": "rgb(0 229 192 / 0.34)",
    "--ok": "#00e5c0",
    "--warn": "#ffc857",
    "--bad": "#ff2d92",
  },
};

const MINIMALIST_MATCHA: Theme = {
  id: "minimalist_matcha",
  label: "Minimalist Matcha",
  description: "White grids and soft sage.",
  light: true,
  swatches: ["#ffffff", "#e7ede4", "#6b9071"],
  tokens: {
    "--void": "#fbfdfa",
    "--void-raised": "#ffffff",
    "--app-bg": "#fbfdfa",
    "--panel": "#ffffff",
    "--panel-raised": "#f4f8f2",
    "--panel-hover": "#eaf1e7",
    // Inverted ramp: on white, text-1 is near-black and text-4 is the
    // lightest. Reusing the dark ramp here is what produces unreadable
    // grey-on-white.
    "--text-1": "#1b241d",
    "--text-2": "#47554a",
    "--text-3": "#6d7d71",
    "--text-4": "#93a397",
    "--line": "rgb(27 36 29 / 0.09)",
    "--line-strong": "rgb(27 36 29 / 0.16)",
    "--accent": "#6b9071",
    "--accent-bright": "#548057",
    "--accent-dim": "#3f6b48",
    "--accent-soft": "rgb(107 144 113 / 0.13)",
    "--accent-line": "rgb(107 144 113 / 0.34)",
    "--ok": "#4f8a5c",
    "--warn": "#b7791f",
    "--bad": "#b4453f",
  },
};

export const THEMES: Record<ThemeId, Theme> = {
  acedecks: ACEDECKS,
  dark_academia: DARK_ACADEMIA,
  tokyo_midnight: TOKYO_MIDNIGHT,
  minimalist_matcha: MINIMALIST_MATCHA,
};

export const THEME_LIST: Theme[] = [
  ACEDECKS,
  DARK_ACADEMIA,
  TOKYO_MIDNIGHT,
  MINIMALIST_MATCHA,
];

/** Unknown ids fall back to the default rather than throwing. */
export function resolveTheme(id: string | null | undefined): Theme {
  if (id && id in THEMES) return THEMES[id as ThemeId];
  return ACEDECKS;
}

/**
 * The brief passes themes by display name ("Tokyo Midnight"). Accepts
 * either that or the id, so an AI payload and a stored preference can use
 * whichever they have.
 */
export function themeFromLabel(value: string | null | undefined): Theme {
  if (!value) return ACEDECKS;
  const key = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (key in THEMES) return THEMES[key as ThemeId];
  const byLabel = THEME_LIST.find((t) => t.label.toLowerCase() === value.toLowerCase());
  return byLabel ?? ACEDECKS;
}

/** Writes a theme's tokens onto an element. Returns the theme applied. */
export function applyTheme(theme: Theme, root: HTMLElement): Theme {
  for (const [token, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(token, value);
  }
  // Lets CSS branch on light vs dark without re-reading every token, and
  // tells the browser which form controls and scrollbars to render.
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.light ? "light" : "dark";
  return theme;
}
