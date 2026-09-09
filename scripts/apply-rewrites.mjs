// Apply scripts/question-rewrites.ts to the database, then emit a migration
// so every other database gets the same change.
//
// Validated before anything is written. A rewrite has to survive
// validateQuestion (a real key, no duplicate options, an explanation that
// does not contradict itself) AND it has to actually clear the flaw it was
// written to fix -- otherwise the rewrite is a lateral move and I would
// rather know.
//
// Run: node --import tsx scripts/apply-rewrites.mjs [--write]

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REWRITES } from "./question-rewrites.ts";
import { validateQuestion } from "../lib/server/questionBankValidation.ts";
import { findQualityFlaws } from "../lib/server/questionQuality.ts";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_0-9]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--write");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: rows, error } = await db
  .from("diagnostic_questions")
  .select("id, section, domain, skill, difficulty, question_type, question_text, stimulus, answer_choices, correct_answer, explanation")
  .limit(20000);
if (error) throw new Error(error.message);

const byId = new Map(rows.map((r) => [r.id, r]));

let ok = 0;
let refused = 0;
const applied = [];

for (const rewrite of REWRITES) {
  const row = byId.get(rewrite.id);
  if (!row) {
    refused += 1;
    console.log(`  MISSING ${rewrite.id}`);
    continue;
  }

  const next = {
    ...row,
    answer_choices: rewrite.choices,
    correct_answer: rewrite.correct,
    explanation: rewrite.explanation ?? row.explanation,
  };

  const issues = validateQuestion(next);
  if (issues.length) {
    refused += 1;
    console.log(`  INVALID ${rewrite.id}: ${issues.map((i) => i.code).join(", ")}`);
    continue;
  }

  const before = findQualityFlaws(row).map((f) => f.code);
  const after = findQualityFlaws(next).map((f) => f.code);
  const stillThere = after.filter((c) => before.includes(c));
  if (stillThere.length) {
    refused += 1;
    console.log(`  NOT FIXED ${rewrite.id}: still ${stillThere.join(", ")}`);
    continue;
  }

  ok += 1;
  applied.push({ row, next });
  console.log(`  ok ${rewrite.id}  ${before.join(",") || "-"} -> ${after.join(",") || "clean"}`);
}

console.log(`\n${ok} rewrites valid, ${refused} refused`);
if (!APPLY) {
  console.log("(dry run -- pass --write to apply)");
  process.exit(refused > 0 ? 1 : 0);
}

for (const { row, next } of applied) {
  const { error: upErr } = await db
    .from("diagnostic_questions")
    .update({
      answer_choices: next.answer_choices,
      correct_answer: next.correct_answer,
      explanation: next.explanation,
    })
    .eq("id", row.id);
  if (upErr) throw new Error(`${row.id}: ${upErr.message}`);
}
console.log(`applied ${applied.length} rewrites to the database`);

/* ------------------------------------------------------------ migration */

const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const values = applied.map(({ row, next }) =>
  `  (${lit(row.stimulus)}, ${lit(row.question_text)},\n` +
  `   ${lit(JSON.stringify(next.answer_choices))},\n` +
  `   ${lit(next.correct_answer)}, ${lit(next.explanation)})`
);

const sql = `-- Rewritten answer options for the questions the quality audit flagged.
--
-- lib/server/questionQuality.ts checks for the item-writing flaws that let a
-- student answer without knowing anything, and it found two running through
-- the SAT bank.
--
-- The evidence and inference items had a careful, precise key and three
-- throwaway distractors -- "The study lasted eight weeks", "Farmers markets
-- are seasonal". Picking the longest option scored 100 percent on that whole
-- set. Every option is now a genuine finding from the passage, and the wrong
-- ones fail because they do not ISOLATE the variable the claim depends on,
-- which is the reasoning the real exam tests.
--
-- The rest leaned on absolutes -- "Libraries should never charge fines under
-- any circumstances", "Historians never revisit old assumptions". Nobody
-- picks those, so a four-option question was really a two-option one.
--
-- Three bare arithmetic stems ("What is the value of 2^3 * 2^2?") now ask for
-- the result in exponent form, so each wrong option is a different exponent
-- rule misapplied rather than a number that is simply not the answer.
--
-- Every rewrite here was checked before it shipped: it must pass
-- validateQuestion, and it must actually clear the flaw it was written to
-- fix. Matched on (stimulus, question_text), the same identity the unique
-- index uses, so this is portable and idempotent.

update public.diagnostic_questions q
set
  answer_choices = v.answer_choices::jsonb,
  correct_answer = v.correct_answer,
  explanation = v.explanation
from (values
${values.join(",\n\n")}
) as v(stimulus, question_text, answer_choices, correct_answer, explanation)
where coalesce(q.stimulus, '') = coalesce(v.stimulus, '')
  and q.question_text = v.question_text;
`;

const out = join(process.cwd(), "supabase", "migrations", "20260908_04_rewritten_distractors.sql");
writeFileSync(out, sql);
console.log(`wrote ${out}`);
