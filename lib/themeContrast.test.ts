import { describe, expect, it } from "vitest";
import { THEME_LIST } from "@/lib/themes";

// WCAG 2.1 contrast, enforced against the real theme tokens rather than a
// spreadsheet someone kept alongside them.
//
// This exists because two shipped themes failed badly and silently: neither
// Dark Academia nor Tokyo Midnight set --on-brand, so they inherited white,
// and a white label on gold (#c9a227) is 2.42:1 while white on bright teal
// (#00e5c0) is 1.62:1. Both are effectively unreadable, and nothing in the
// build had an opinion about it.
//
// The rule a theme author needs is not "use white labels", it is "a light
// accent needs a dark label" -- which is exactly what a ratio check encodes
// and a hardcoded colour does not.

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme contrast", () => {
  it("has a self-consistent contrast helper", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  for (const theme of THEME_LIST) {
    describe(theme.label, () => {
      const token = (name: string): string => {
        const value = theme.tokens[name];
        expect(value, `${theme.id} is missing ${name}`).toBeTruthy();
        return value;
      };

      it("defines the accent tokens every surface reads from", () => {
        // --brand* in globals.css alias --accent, so a theme that omits one of
        // these leaves the app on the previous theme's value for it.
        for (const name of ["--accent", "--accent-text", "--on-brand", "--panel"]) {
          expect(theme.tokens[name], `${theme.id} is missing ${name}`).toBeTruthy();
        }
      });

      it("renders accent-coloured TEXT readably on its own panel", () => {
        const ratio = contrastRatio(token("--accent-text"), token("--panel"));
        expect(
          ratio,
          `--accent-text ${token("--accent-text")} on --panel ${token("--panel")} is ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });

      it("renders a button label readably on the accent fill", () => {
        // The failure this catches: a light accent (gold, bright teal) with an
        // inherited white label.
        const ratio = contrastRatio(token("--on-brand"), token("--accent"));
        expect(
          ratio,
          `--on-brand ${token("--on-brand")} on --accent ${token("--accent")} is ${ratio.toFixed(2)}:1 — a light accent needs a dark label`
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });

      it("keeps the accent fill distinguishable from the panel behind it", () => {
        // A non-text UI boundary, so the 3:1 floor applies rather than 4.5:1.
        const ratio = contrastRatio(token("--accent"), token("--panel"));
        expect(
          ratio,
          `--accent ${token("--accent")} on --panel ${token("--panel")} is ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(AA_LARGE);
      });

      it("keeps body and secondary text readable on the panel", () => {
        for (const name of ["--text-1", "--text-2"]) {
          const ratio = contrastRatio(token(name), token("--panel"));
          expect(
            ratio,
            `${name} ${token(name)} on --panel ${token("--panel")} is ${ratio.toFixed(2)}:1`
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        }
      });
    });
  }
});
