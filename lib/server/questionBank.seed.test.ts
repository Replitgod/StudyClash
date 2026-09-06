import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseExplanationOverrides,
  parseSeedQuestions,
  type SeedQuestion,
} from "./seedQuestionParser";
import { findDuplicateQuestions, validateQuestion } from "./questionBankValidation";

// Every question AceDecks ships, checked on every commit.
//
// The exam banks are hand-written SQL. A correct_answer of "E" on a
// four-choice question, two choices with identical text, an explanation
// arguing for a different letter than the key -- none of those throw. They
// ship, and a student loses a mark on a question that was wrong before they
// read it. Several hundred rows is more than proofreading survives, so this
// reads the migrations back and puts every row through the validator.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function seedFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, name), "utf8");
      return sql.includes("insert into public.diagnostic_questions");
    })
    .sort();
}

const FILES = seedFiles();

/**
 * Explanation rewrites from every migration, not only the seeds.
 *
 * A seed that has already run somewhere is history, so a better explanation
 * ships as an UPDATE in a later migration. Judging a question on the prose in
 * its original file would fail rows that no database still holds that way.
 */
const OVERRIDES = new Map<string, string>();
for (const name of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"))) {
  for (const [text, explanation] of parseExplanationOverrides(
    readFileSync(join(MIGRATIONS_DIR, name), "utf8")
  )) {
    OVERRIDES.set(text, explanation);
  }
}

function effective(question: SeedQuestion): SeedQuestion {
  const override = question.question_text ? OVERRIDES.get(question.question_text) : undefined;
  return override ? { ...question, explanation: override } : question;
}

const BY_FILE = new Map<string, SeedQuestion[]>(
  FILES.map((name) => [
    name,
    parseSeedQuestions(readFileSync(join(MIGRATIONS_DIR, name), "utf8")).map(effective),
  ])
);

const ALL: SeedQuestion[] = [...BY_FILE.values()].flat();

describe("the shipped question bank", () => {
  // The guard that stops this whole file from passing vacuously. A parser
  // that quietly reads nothing would turn every assertion below into a
  // no-op, which is worse than no test at all.
  it("finds the seed migrations and reads questions out of them", () => {
    expect(FILES.length).toBeGreaterThan(0);
    expect(ALL.length).toBeGreaterThan(150);
  });

  it("has no invalid question anywhere in it", () => {
    const failures: string[] = [];

    for (const [file, questions] of BY_FILE) {
      questions.forEach((question, index) => {
        const issues = validateQuestion(question);
        if (issues.length === 0) return;

        failures.push(
          `${file} #${index + 1} (${question.question_text?.slice(0, 70)}…): ` +
            issues.map((issue) => `[${issue.code}] ${issue.message}`).join(" ")
        );
      });
    }

    expect(failures).toEqual([]);
  });

  // Identity is the stimulus and the stem together. On the Digital SAT the
  // stem is boilerplate and the question is the passage above it, which is
  // exactly what the old unique index got wrong.
  it("has no near-duplicate questions within an exam", () => {
    const failures: string[] = [];

    for (const [file, questions] of BY_FILE) {
      const duplicates = findDuplicateQuestions(
        questions.map((question, index) => ({
          id: `#${index + 1}`,
          question_text: question.question_text,
          stimulus: question.stimulus,
        }))
      );

      for (const duplicate of duplicates) {
        failures.push(`${file}: rows ${duplicate.ids.join(", ")} ask the same question`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("uses only difficulties and question types the schema allows", () => {
    const difficulties = new Set(["easy", "medium", "hard"]);
    const types = new Set([
      "multiple_choice",
      "student_produced_response",
      "multiple_response",
    ]);

    for (const question of ALL) {
      expect(difficulties.has(String(question.difficulty))).toBe(true);
      expect(types.has(String(question.question_type))).toBe(true);
    }
  });

  // A bank that is all easy questions cannot route an adaptive module, and a
  // bank that is all hard ones tells a struggling student nothing except
  // that they are struggling.
  it("spreads each exam's questions across all three difficulties", () => {
    for (const [file, questions] of BY_FILE) {
      const seen = new Set(questions.map((question) => question.difficulty));
      expect({ file, seen: [...seen].sort() }).toEqual({
        file,
        seen: ["easy", "hard", "medium"],
      });
    }
  });

  // Every explanation is read by a student who just got the question wrong,
  // and it is the only part of the product that has to teach on its own.
  it("explains every answer at more than a sentence fragment", () => {
    const thin = ALL.filter((question) => (question.explanation || "").trim().length < 40).map(
      (question) => question.question_text?.slice(0, 60)
    );
    expect(thin).toEqual([]);
  });
});
