// Violet to blue, across the whole product.
//
// SPENT. This ran once and its COLORS map is deliberately not maintained --
// it was incomplete when it ran, converting 65 values and missing eight,
// including the whole top of the indigo scale and both stops on .btn-accent.
// Do not reach for it to catch a stray color; a list cannot know about a
// value nobody added to it. lib/brandHue.test.ts checks the property that
// actually matters (nothing in app/ or lib/ sits in the purple arc) and
// scripts/find-stray-purple.mjs prints the same thing with file and line.
// This is kept only as the record of which values moved and why.
//
// The design system was built so this is one change rather than fifty: ONE
// accent leads everything, and `--brand*` are aliases of `--accent` rather
// than a second palette. What is left is the literal hex values -- the accent
// ramp itself, the logo tile gradient, and the rgb() forms used for the soft
// and line tints, which cannot reference a token.
//
// Every blue below was chosen against the contrast the violet actually had,
// not by eye. The base is #2a63d8 because white-on-it is 5.42:1, which is
// where violet sat (5.39:1) -- so the primary button label is exactly as
// readable as before rather than "probably fine".
//
// Run: node scripts/recolor-brand.mjs [--write]

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const WRITE = process.argv.includes("--write");

/**
 * Violet to blue, at matched lightness.
 *
 * Case matters and is load-bearing in one place: `#5842ab` is --accent-dim
 * (a fill on dark) while `#5842AB` is the wordmark on the LIGHT marketing
 * surface. They need different blues -- a fill can be deep, text on white
 * has to clear 4.5:1 -- and the casing is what tells them apart.
 */
const COLORS = [
  // --- the accent ramp ---
  ["#6e56cf", "#2a63d8"], // --accent            white on it 5.42:1 (violet was 5.39)
  ["#6E56CF", "#2A63D8"], // same, uppercase in the logo gradient
  ["#8b7bf0", "#5b8ff5"], // --accent-bright
  ["#5842ab", "#1c4aa8"], // --accent-dim        a fill, so it can go deep
  ["#5842AB", "#1B4FBF"], // wordmark on white   7.20:1
  ["#b9a8ff", "#9dc0ff"], // --accent-text       10.55:1 on --panel (violet was 9.34)
  ["#2a1d59", "#10305f"], // --brand-ink         13.04:1 on white

  // --- the logo mark ---
  ["#9B8AFF", "#7FA8FF"], // tile gradient, light stop
  ["#4A3596", "#17408F"], // tile gradient, dark stop
  ["#3D2A80", "#12336E"], // deepest card in the stack
  ["#A896FF", "#8FB6FF"], // middle card
  ["#F1EDFF", "#EDF3FF"], // top card, near-white with a blue cast

  // --- rgb() forms, which cannot reference a token ---
  ["124 106 240", "42 99 216"],  // --accent-soft / --accent-line
  ["139 123 240", "91 143 245"], // gradient-soft, light stop
  ["88 66 171", "28 74 168"],    // gradient-soft, dark stop
];

const TARGETS = [
  { dir: "app", exts: [".css", ".tsx", ".ts"] },
  { dir: "lib", exts: [".ts", ".tsx"] },
];

function filesIn(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...filesIn(full, exts));
    } else if (exts.includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

let total = 0;
for (const target of TARGETS) {
  for (const path of filesIn(target.dir, target.exts)) {
    const original = readFileSync(path, "utf8");
    let text = original;
    let hits = 0;

    for (const [violet, blue] of COLORS) {
      const parts = text.split(violet);
      if (parts.length === 1) continue;
      hits += parts.length - 1;
      text = parts.join(blue);
    }

    if (hits > 0) {
      total += hits;
      console.log(`${String(hits).padStart(3)}  ${path}`);
      if (WRITE) writeFileSync(path, text);
    }
  }
}

console.log(`\n${total} color values replaced`);
if (!WRITE) console.log("(dry run -- pass --write to apply)");
