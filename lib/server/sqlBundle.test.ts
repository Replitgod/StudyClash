import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/sql/apply-2026-09-06.sql is the file a human pastes into the Supabase
// SQL editor, and it is a copy of seven migrations. A copy goes stale: someone
// fixes a question in a migration, the bundle keeps the old one, and the
// database ends up holding whichever version was pasted rather than whichever
// version is in the repository.
//
// Regenerate with: node scripts/build-sql-bundle.mjs

const BUNDLE = join(process.cwd(), "docs", "sql", "apply-2026-09-06.sql");
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** The order the bundle must concatenate them in. See the file's own header. */
const FILES = [
  "20260906_01_diagnostic_question_identity_fix.sql",
  "20260906_02_exam_definitions_expansion.sql",
  "20260906_03_act_question_bank.sql",
  "20260906_04_nclex_rn_question_bank.sql",
  "20260906_05_mcat_question_bank.sql",
  "20260906_06_gre_question_bank.sql",
  "20260906_07_voice_topic_tutoring.sql",
];

const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE, "utf8").replace(/\r\n/g, "\n") : "";

describe("the paste-ready SQL bundle", () => {
  it("exists", () => {
    expect(bundle.length).toBeGreaterThan(1000);
  });

  it("carries every migration verbatim", () => {
    const missing: string[] = [];

    for (const file of FILES) {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/\r\n/g, "\n").trim();
      if (!bundle.includes(sql)) missing.push(file);
    }

    // Named rather than counted, so the failure says which file drifted.
    expect(missing).toEqual([]);
  });

  // Ordering is the one thing about this bundle that fails silently. File 01
  // creates the unique index files 03 to 06 insert against, and an insert
  // against the old index drops rows through ON CONFLICT DO NOTHING without
  // a word -- which is how a third of the SAT bank went missing in the first
  // place.
  it("concatenates them in dependency order", () => {
    const positions = FILES.map((file) => ({
      file,
      at: bundle.indexOf(`-- FILE: ${file}`),
    }));

    for (const entry of positions) {
      expect({ file: entry.file, present: entry.at >= 0 }).toEqual({
        file: entry.file,
        present: true,
      });
    }

    const order = positions.map((entry) => entry.at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  // A bundle that starts inserting into tables that do not exist produces a
  // wall of Postgres errors. One readable message is worth the eight lines.
  it("refuses to run against a database missing its prerequisites", () => {
    for (const table of [
      "public.exam_definitions",
      "public.diagnostic_questions",
      "public.voice_sessions",
    ]) {
      expect(bundle).toContain(`to_regclass('${table}') is null`);
    }
  });

  it("uses the corrected index expression everywhere, and never the old one", () => {
    expect(bundle).toContain("md5(coalesce(stimulus, '') || E'\\x1f' || question_text)");
    // The stem-only expression is what dropped the rows. It may appear in
    // prose explaining the bug, but never as a live ON CONFLICT target.
    expect(bundle).not.toMatch(/on conflict \(exam_id, md5\(question_text\)\)/);
  });
});
