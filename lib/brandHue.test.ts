import { describe, expect, it } from "vitest";
// Shared with the CLI report in scripts/, so both use one definition of purple.
import { findStrayPurple, hueOf } from "../scripts/find-stray-purple.mjs";

// The brand is one blue. This checks that it actually is, everywhere.
//
// The violet-to-blue change was done by replacing a list of known hex values,
// and the list was wrong in the way lists always are: it converted 65 colors
// and missed eight. Four of the misses were the top of Tailwind's `indigo`
// scale, which app/globals.css redefines and which ~340 utility class uses
// resolve through -- so half the app stayed violet while the tokens said blue.
// Two more were the gradient stops on .btn-accent, the primary call to action
// on the marketing page. Nothing failed; it just looked wrong, and only on
// the surfaces nobody had opened recently.
//
// A hue check needs no list. Any purple anyone adds later fails here, whether
// or not somebody remembered to write it down.

type Stray = {
  path: string;
  line: number;
  literal: string;
  hue: number;
  context: string;
};

describe("hueOf", () => {
  it("places the brand blue and the retired violet on opposite sides", () => {
    // If this ever stops being true the scan below is measuring nothing.
    expect(Math.round(hueOf(0x2a, 0x63, 0xd8).hue)).toBe(220); // --accent
    expect(Math.round(hueOf(0x6e, 0x56, 0xcf).hue)).toBe(252); // the old violet
  });

  it("reports near-greys as unsaturated so they are not chased", () => {
    const { saturation } = hueOf(0x2a, 0x2a, 0x2c);
    expect(saturation).toBeLessThan(0.12);
  });
});

describe("brand color", () => {
  it("has no purple left in app/ or lib/", () => {
    const stray = findStrayPurple() as Stray[];

    // Name the offenders. "expected 3 to be 0" sends the next person hunting.
    const report = stray
      .map((s) => `${s.path}:${s.line} ${s.literal} (hue ${s.hue}) — ${s.context}`)
      .join("\n");

    expect(report).toBe("");
  });

  it("still catches a purple when there is one", () => {
    // Guards against the scan quietly matching nothing -- a broken regex or a
    // wrong directory would otherwise make the test above pass forever.
    const { hue, saturation } = hueOf(0x7c, 0x6a, 0xf0);
    expect(hue).toBeGreaterThanOrEqual(246);
    expect(hue).toBeLessThanOrEqual(300);
    expect(saturation).toBeGreaterThanOrEqual(0.12);
  });
});
