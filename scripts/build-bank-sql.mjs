// Turn an authored bank into a migration, refusing to emit a bad one.
//
// Authoring every item with its key at A is the natural way to write them and
// the worst way to ship them: a bank where the answer is always A is beaten
// by a student who notices, and I have already made exactly this mistake once
// in this codebase -- eighteen hand-written rewrites that pushed the SAT's key
// distribution from 27 percent to 42 percent on A.
//
// So the keys are redistributed here rather than by hand. lib/server/keyBalance.ts
// moves the choice TEXTS and leaves the letters in place, which is what makes
// the change checkable: every letter reference inside the explanation is
// rewritten through the same recorded mapping, and then verified by
// recomputing it.
//
// Nothing is written unless every item passes validateQuestion. A migration
// that emits a question with no key, duplicate options, or an explanation that
// argues for a different letter than the one stored is worse than no
// migration, because it looks fine in review and fails in front of a student.
//
// Run: node scripts/build-bank-sql.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3];
const EXAM_SLUG = process.argv[4];

if (!SRC || !OUT || !EXAM_SLUG) {
  console.error("usage: node scripts/build-bank-sql.mjs <bank.ts> <out.sql> <exam_slug>");
  process.exit(1);
}

const { validateQuestion } = await import("../lib/server/questionBankValidation.ts");
const { findQualityFlaws, keyPositionBias } = await import("../lib/server/questionQuality.ts");
const { balanceQuestion, remapExplanation, targetLetters, verifyRemap } = await import(
  "../lib/server/keyBalance.ts"
);

const mod = await import("file://" + join(process.cwd(), SRC).replace(/\\/g, "/"));
const items = Object.values(mod).find((v) => Array.isArray(v));
if (!items) throw new Error(`No exported array found in ${SRC}`);

console.log(`${items.length} authored items\n`);

/* ------------------------------------------------- redistribute the keys */

// Balanced within each section, not across the bank. A student sits one
// section at a time, so an even spread overall that is lopsided inside
// Physics is still a guessable Physics section.
const bySection = new Map();
for (const item of items) {
  if (!bySection.has(item.section)) bySection.set(item.section, []);
  bySection.get(item.section).push(item);
}

const balanced = [];
let remapFailures = 0;

for (const [section, group] of bySection) {
  // Grouped by option count: a five-option item cannot take a key of E if
  // its neighbours only have four options.
  const byCount = new Map();
  for (const item of group) {
    const n = item.choices.length;
    if (!byCount.has(n)) byCount.set(n, []);
    byCount.get(n).push(item);
  }

  for (const [optionCount, subset] of byCount) {
    const targets = targetLetters(subset.length, optionCount);
    subset.forEach((item, index) => {
      const result = balanceQuestion({
        choices: item.choices,
        correctAnswer: item.correct,
        explanation: item.explanation,
        targetLetter: targets[index],
      });

      const nextExplanation = remapExplanation(item.explanation, result.mapping);

      const ok = verifyRemap({
        before: { choices: item.choices, correctAnswer: item.correct, explanation: item.explanation },
        after: { choices: result.choices, correctAnswer: result.correctAnswer, explanation: nextExplanation },
        mapping: result.mapping,
      });
      if (!ok) {
        remapFailures += 1;
        console.log(`  REMAP FAILED (${section}): ${item.questionText.slice(0, 60)}`);
        return;
      }

      balanced.push({
        ...item,
        choices: result.choices,
        correct: result.correctAnswer,
        explanation: nextExplanation,
      });
    });
  }
}

if (remapFailures > 0) {
  console.error(`\n${remapFailures} explanation remaps could not be verified. Nothing written.`);
  process.exit(1);
}

/* -------------------------------------------------------------- validate */

let invalid = 0;
const flawCounts = {};

for (const item of balanced) {
  const asRow = {
    question_type: "multiple_choice",
    question_text: item.questionText,
    stimulus: item.stimulus,
    section: item.section,
    domain: item.domain,
    skill: item.skill,
    difficulty: item.difficulty,
    answer_choices: item.choices,
    correct_answer: item.correct,
    explanation: item.explanation,
  };

  const issues = validateQuestion(asRow);
  if (issues.length > 0) {
    invalid += 1;
    console.log(`  INVALID: ${item.questionText.slice(0, 60)}`);
    for (const issue of issues) console.log(`     ${issue.code}: ${issue.message}`);
  }

  for (const flaw of findQualityFlaws(asRow)) {
    flawCounts[flaw.code] = (flawCounts[flaw.code] || 0) + 1;
  }
}

if (invalid > 0) {
  console.error(`\n${invalid} items failed validation. Nothing written.`);
  process.exit(1);
}

console.log("all items valid\n");

for (const [section] of bySection) {
  const rows = balanced.filter((i) => i.section === section);
  const bias = keyPositionBias(
    rows.map((i) => ({ correct_answer: i.correct, question_type: "multiple_choice" }))
  );
  const spread = Object.entries(bias.counts)
    .sort()
    .map(([k, n]) => `${k}:${n}`)
    .join(" ");
  console.log(
    `  ${section.padEnd(14)} ${String(rows.length).padStart(3)} items  keys ${spread}  worst ${Math.round(bias.share * 100)}%`
  );
}

console.log("\nadvisory quality flags:", Object.keys(flawCounts).length ? flawCounts : "none");

/* ------------------------------------------------------------------- SQL */

const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const values = balanced
  .map(
    (item) =>
      `  (${lit(item.section)}, ${lit(item.domain)}, ${lit(item.skill)}, ${lit(item.difficulty)}, 'multiple_choice',\n` +
      `   ${lit(item.stimulus)},\n` +
      `   ${lit(item.questionText)},\n` +
      `   ${lit(JSON.stringify(item.choices))},\n` +
      `   ${lit(item.correct)}, ${lit(item.explanation)})`
  )
  .join(",\n\n");

const header = readFileSync(SRC, "utf8")
  .split("\n")
  .filter((line) => line.startsWith("//"))
  .join("\n")
  .replace(/^\/\//gm, "--");

const sql = `${header}
--
-- GENERATED by scripts/build-bank-sql.mjs from ${SRC}. Edit the bank and
-- regenerate rather than editing this file: the answer keys below were
-- redistributed and every letter reference in the explanations rewritten to
-- match, and doing that by hand is how a bank ends up with an explanation
-- arguing for a letter that is no longer the key.
--
-- Idempotent through the (exam_id, stimulus + question_text) unique index.

insert into public.diagnostic_questions
  (exam_id, section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation, status, source_type, reviewed_at)
select e.id, v.section, v.domain, v.skill, v.difficulty, v.question_type, v.stimulus, v.question_text, v.answer_choices::jsonb, v.correct_answer, v.explanation, 'published', 'human_authored', now()
from public.exam_definitions e
cross join (values

${values}

) as v(section, domain, skill, difficulty, question_type, stimulus, question_text, answer_choices, correct_answer, explanation)
where e.slug = ${lit(EXAM_SLUG)}
on conflict do nothing;

-- Switched on only now, with a bank behind it.
update public.exam_definitions
set status = 'available'
where slug = ${lit(EXAM_SLUG)};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, sql, "utf8");
console.log(`\nwrote ${OUT} (${balanced.length} items)`);
