// British to American spelling, in student-facing text.
//
// The exams AceDecks prepares people for are all American -- the SAT, the
// ACT, the MCAT, the NCLEX, the GRE -- and the questions were written in
// British English. A student reading "the enzyme catalysed the reaction" on
// an MCAT question is reading something the real exam would never print, and
// it is the kind of detail that tells them, correctly, that nobody checked.
//
// Only genuine differences are listed. Words that are identical in both --
// "catalyst", "organism", "analysis" -- are deliberately absent, and a
// prefix-matching regex that "found" them was a false positive.
//
// Run: node scripts/americanize.mjs [--write]

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const WRITE = process.argv.includes("--write");

/** [British, American]. Longest forms first so stems do not eat them. */
const SPELLINGS = [
  ["behaviours", "behaviors"], ["behaviour", "behavior"],
  ["Behaviours", "Behaviors"], ["Behaviour", "Behavior"],
  ["catalysed", "catalyzed"], ["catalyses", "catalyzes"], ["catalysing", "catalyzing"],
  ["analysed", "analyzed"], ["analysing", "analyzing"], ["analyse", "analyze"],
  ["neighbourhoods", "neighborhoods"], ["neighbourhood", "neighborhood"],
  ["neighbouring", "neighboring"], ["neighbours", "neighbors"], ["neighbour", "neighbor"],
  ["colourless", "colorless"], ["colours", "colors"], ["colour", "color"],
  ["Colour", "Color"],
  ["centres", "centers"], ["centre", "center"], ["Centre", "Center"],
  ["travelled", "traveled"], ["travelling", "traveling"],
  ["practising", "practicing"], ["practised", "practiced"],
  ["practises", "practices"], ["practise", "practice"], ["Practise", "Practice"],
  ["organisations", "organizations"], ["organisation", "organization"],
  ["organised", "organized"], ["organise", "organize"],
  ["normalised", "normalized"], ["normalises", "normalizes"], ["normalise", "normalize"],
  ["labelling", "labeling"], ["labelled", "labeled"],
  ["labour", "labor"], ["favourite", "favorite"], ["honour", "honor"],
  ["recognised", "recognized"], ["recognises", "recognizes"], ["recognise", "recognize"],
  ["summarised", "summarized"], ["summarise", "summarize"],
  ["prioritisation", "prioritization"], ["prioritised", "prioritized"],
  ["prioritises", "prioritizes"], ["prioritise", "prioritize"],
  ["Prioritisation", "Prioritization"],
  ["judgements", "judgments"], ["judgement", "judgment"], ["Judgement", "Judgment"],
  ["defence", "defense"], ["licence", "license"],
  ["metres", "meters"], ["metre", "meter"],
  ["litres", "liters"], ["litre", "liter"],
  ["fibre", "fiber"], ["fibres", "fibers"],
  ["maximise", "maximize"], ["minimise", "minimize"],
  ["utilise", "utilize"], ["utilised", "utilized"],
  ["realised", "realized"], ["realise", "realize"],
  ["apologise", "apologize"], ["emphasise", "emphasize"], ["emphasised", "emphasized"],
  ["specialised", "specialized"], ["specialise", "specialize"],
  ["standardised", "standardized"], ["standardise", "standardize"],
  ["hospitalised", "hospitalized"], ["immunisation", "immunization"],
  ["oesophagus", "esophagus"], ["haemoglobin", "hemoglobin"],
  ["anaemia", "anemia"], ["oedema", "edema"], ["diarrhoea", "diarrhea"],
  ["paediatric", "pediatric"], ["anaesthetic", "anesthetic"],
  ["haemorrhage", "hemorrhage"], ["foetal", "fetal"],
];

const BOUNDARY = String.fromCharCode(92) + "b";

/**
 * Words that are also identifiers in this codebase.
 *
 * `normaliseHandle` is a real exported function and `normalise` is a local
 * one in two modules. A word boundary already protects the camelCase
 * compounds, but the bare forms would be renamed -- and renaming working
 * code is not a spelling fix, it is a refactor with no reader-facing
 * benefit and a way to break the build. Left alone in TypeScript; still
 * corrected inside SQL, where nothing is an identifier.
 */
const IDENTIFIERS = new Set(["normalise", "normalised", "normalises", "analyse"]);

const TARGETS = [
  { dir: "supabase/migrations", exts: [".sql"], code: false },
  { dir: "app", exts: [".tsx", ".ts"], recurse: true, code: true },
  { dir: "lib", exts: [".ts", ".tsx"], recurse: true, code: true },
];

function filesIn(dir, exts, recurse) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recurse && entry.name !== "node_modules") out.push(...filesIn(full, exts, recurse));
    } else if (exts.includes(extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

let grandTotal = 0;
const perWord = new Map();

for (const target of TARGETS) {
  for (const path of filesIn(target.dir, target.exts, target.recurse)) {
    const original = readFileSync(path, "utf8");
    let text = original;
    let fileTotal = 0;

    for (const [british, american] of SPELLINGS) {
      if (target.code && IDENTIFIERS.has(british)) continue;
      const pattern = new RegExp(BOUNDARY + british + BOUNDARY, "g");
      const hits = (text.match(pattern) || []).length;
      if (!hits) continue;
      text = text.replace(pattern, american);
      fileTotal += hits;
      perWord.set(british, (perWord.get(british) ?? 0) + hits);
    }

    if (fileTotal > 0) {
      grandTotal += fileTotal;
      console.log(`${fileTotal.toString().padStart(3)}  ${path}`);
      if (WRITE) writeFileSync(path, text);
    }
  }
}

console.log(`\n${grandTotal} replacements across ${perWord.size} distinct words`);
for (const [word, n] of [...perWord].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${word}`);
}
if (!WRITE) console.log("\n(dry run -- pass --write to apply)");
