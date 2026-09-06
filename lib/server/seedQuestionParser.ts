// Reading the seeded question banks back out of the migrations.
//
// The banks are hand-written SQL, which means the only thing standing between
// a typo and a student is a careful human -- and several hundred questions is
// more than careful survives. This parser exists so a test can load every
// seeded question on every commit and put it through
// lib/server/questionBankValidation.ts.
//
// Deliberately NOT a SQL parser. It understands exactly the one shape the
// seed migrations use:
//
//   cross join (values
//     ('section', 'domain', ..., null, 'text', '[{...}]', 'B', 'because...'),
//     ...
//   ) as v(section, domain, ...)
//
// which is enough, because that shape is a convention the seeds all follow
// and a migration that broke it would fail this parser loudly rather than
// silently skipping its questions. The row-count assertion in the test is
// what turns "parsed nothing" from a pass into a failure.

export type SeedQuestion = {
  section: string | null;
  domain: string | null;
  skill: string | null;
  difficulty: string | null;
  question_type: string | null;
  stimulus: string | null;
  question_text: string | null;
  answer_choices: string | null;
  correct_answer: string | null;
  explanation: string | null;
};

/**
 * Remove SQL comments, without touching the ones that are not comments.
 *
 * The seeds are heavily commented -- section headers sit between the tuples,
 * and those headers contain brackets, which the tuple splitter would read as
 * rows. But the explanations use " -- " as an em dash all over the place, so
 * a naive strip of everything after `--` would delete the second half of
 * dozens of explanations and then fail to find the closing quote.
 *
 * The distinction is quote state, and nothing else.
 */
function stripComments(sql: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];

    if (inString) {
      out += char;
      if (char === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      out += char;
      continue;
    }

    if (char === "-" && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      if (newline === -1) break;
      // Keep the newline: it separates tuples, and dropping it would join a
      // row to the one after it.
      out += "\n";
      i = newline;
      continue;
    }

    if (char === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    out += char;
  }

  return out;
}

/**
 * Split a `(a, b, c)` tuple list into tuples, respecting quotes.
 *
 * Postgres escapes a single quote by doubling it, so `'it''s'` is one string
 * containing an apostrophe. Getting that wrong is how a parser decides a
 * question ends halfway through and silently drops every row after it.
 */
function splitTopLevel(body: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let inString = false;
  let start = -1;

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (inString) {
      if (char === "'") {
        // A doubled quote is an escaped apostrophe, not the end of the string.
        if (body[i + 1] === "'") {
          i += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === "(") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tuples.push(body.slice(start + 1, i));
        start = -1;
      }
    }
  }

  return tuples;
}

/** Split one tuple's body on the commas that separate its fields. */
function splitFields(tuple: string): string[] {
  const fields: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";

  for (let i = 0; i < tuple.length; i += 1) {
    const char = tuple[i];

    if (inString) {
      current += char;
      if (char === "'") {
        if (tuple[i + 1] === "'") {
          current += "'";
          i += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }

    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;

    if (char === "," && depth === 0) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

/** A SQL literal as a JavaScript value. `null` stays null; quotes unescape. */
function readLiteral(raw: string): string | null {
  const trimmed = raw.trim().replace(/::jsonb$/i, "").trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;

  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  return trimmed;
}

/**
 * Every question a seed migration inserts.
 *
 * Column order is taken from the `as v(...)` alias rather than assumed, so a
 * migration that lists its columns differently is read correctly instead of
 * being read wrongly.
 */
export function parseSeedQuestions(rawSql: string): SeedQuestion[] {
  const questions: SeedQuestion[] = [];
  const sql = stripComments(rawSql);

  // One migration can hold several insert statements.
  const blockPattern = /cross\s+join\s*\(\s*values([\s\S]*?)\)\s*as\s+v\s*\(([^)]*)\)/gi;

  for (const block of sql.matchAll(blockPattern)) {
    const body = block[1];
    const columns = block[2].split(",").map((name) => name.trim().toLowerCase());

    for (const tuple of splitTopLevel(body)) {
      const fields = splitFields(tuple);
      // A tuple whose field count does not match the alias is not a question
      // row; skipping silently would hide exactly the mistake worth finding.
      if (fields.length !== columns.length) {
        throw new Error(
          `Seed row has ${fields.length} fields but the column list names ${columns.length}: ${tuple.slice(0, 120)}`
        );
      }

      const row: Record<string, string | null> = {};
      columns.forEach((column, index) => {
        row[column] = readLiteral(fields[index]);
      });

      questions.push({
        section: row.section ?? null,
        domain: row.domain ?? null,
        skill: row.skill ?? null,
        difficulty: row.difficulty ?? null,
        question_type: row.question_type ?? null,
        stimulus: row.stimulus ?? null,
        question_text: row.question_text ?? null,
        answer_choices: row.answer_choices ?? null,
        correct_answer: row.correct_answer ?? null,
        explanation: row.explanation ?? null,
      });
    }
  }

  return questions;
}

/**
 * Explanation rewrites applied by a later migration.
 *
 * A seed migration that has already run somewhere is history: rewriting the
 * file fixes nobody's database, so a better explanation ships as an UPDATE in
 * a new migration instead. That leaves the original text in the original file
 * and the corrected text somewhere else, and a check that reads only the
 * inserts would judge the bank on prose no database still holds.
 *
 * Reads the one shape those corrections use:
 *
 *   update public.diagnostic_questions q
 *   set explanation = v.explanation
 *   from (values ('question text', 'better explanation'), ...)
 *     as v(question_text, explanation)
 */
export function parseExplanationOverrides(rawSql: string): Map<string, string> {
  const sql = stripComments(rawSql);
  const overrides = new Map<string, string>();

  const blockPattern =
    /set\s+explanation\s*=\s*v\.explanation\s+from\s*\(\s*values([\s\S]*?)\)\s*as\s+v\s*\(([^)]*)\)/gi;

  for (const block of sql.matchAll(blockPattern)) {
    const columns = block[2].split(",").map((name) => name.trim().toLowerCase());
    const textIndex = columns.indexOf("question_text");
    const explanationIndex = columns.indexOf("explanation");
    if (textIndex < 0 || explanationIndex < 0) continue;

    for (const tuple of splitTopLevel(block[1])) {
      const fields = splitFields(tuple);
      if (fields.length !== columns.length) continue;

      const text = readLiteral(fields[textIndex]);
      const explanation = readLiteral(fields[explanationIndex]);
      if (text && explanation) overrides.set(text, explanation);
    }
  }

  return overrides;
}
