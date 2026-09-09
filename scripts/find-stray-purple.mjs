// Find every purple left in the product, by hue rather than by a list.
//
// The brand went from violet to blue by replacing a list of known hex values,
// and a list is exactly the wrong tool: it found 65 of them and missed the
// biggest button on the marketing site, whose gradient and glow were written
// as #7669cc, #5238ad and rgb(110 86 207) -- three violets that were never in
// the list because nobody had written them down.
//
// This does not need a list. It parses every color literal it can find,
// converts to HSL, and reports anything in the purple arc. A hue is a fact
// about a color; a list is a memory of one.
//
// Run: node scripts/find-stray-purple.mjs

import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

/** Purple/violet sits here. Blue ends around 245; magenta starts around 300. */
const PURPLE_MIN = 246;
const PURPLE_MAX = 300;

/** Below this saturation a "purple" is really a grey and nobody reads it as brand. */
const MIN_SATURATION = 0.12;

export function hueOf(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }
  if (hue < 0) hue += 360;

  return { hue, saturation, lightness };
}

function parseHex(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

// 3, 6 and 8 digit hex, plus rgb()/rgba() in both comma and space syntax.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/g;

function filesIn(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        out.push(...filesIn(full, exts));
      }
    } else if (exts.includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Colors that are allowed to sit in the purple arc.
 *
 * The screw base of the logo lightbulb is grey metal with a faint cool cast.
 * It is not brand, nothing about it should track the accent, and turning it
 * blue would tint a piece of hardware that reads as aluminum.
 */
const ALLOWED = new Set(["#6E6A8A"]);

export function findStrayPurple(dirs = ["app", "lib"]) {
  const found = [];

  for (const dir of dirs) {
    for (const path of filesIn(dir, [".css", ".ts", ".tsx"])) {
      const lines = readFileSync(path, "utf8").split("\n");

      lines.forEach((line, index) => {
        const hits = [];

        for (const match of line.matchAll(HEX)) {
          const rgb = parseHex(match[0]);
          if (rgb) hits.push({ literal: match[0], rgb });
        }
        for (const match of line.matchAll(RGB)) {
          hits.push({
            literal: match[0] + ")",
            rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
          });
        }

        for (const hit of hits) {
          const { hue, saturation } = hueOf(...hit.rgb);
          if (
            hue >= PURPLE_MIN &&
            hue <= PURPLE_MAX &&
            saturation >= MIN_SATURATION &&
            !ALLOWED.has(hit.literal.toUpperCase())
          ) {
            found.push({
              path,
              line: index + 1,
              literal: hit.literal,
              hue: Math.round(hue),
              context: line.trim().slice(0, 90),
            });
          }
        }
      });
    }
  }

  return found;
}

// Only report when run as a command. lib/brandHue.test.ts imports the
// function, and a module that exits the process on import would take the
// whole test run with it.
if (process.argv[1] && process.argv[1].endsWith("find-stray-purple.mjs")) {
  const found = findStrayPurple();
  if (found.length === 0) {
    console.log("No purple left.");
  } else {
    console.log(`${found.length} purple color literals still in the source:\n`);
    for (const f of found) {
      console.log(`  ${f.path}:${f.line}  ${f.literal}  (hue ${f.hue})`);
      console.log(`      ${f.context}`);
    }
  }
  process.exit(found.length > 0 ? 1 : 0);
}
