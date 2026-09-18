import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/sql/apply-2026-09-18.sql is what a human pastes into the Supabase
// SQL editor. It must carry both migrations exactly as they are in the
// repository, in dependency order: 01 creates public.deck_is_readable,
// which 02's flashcards policy calls.
//
// Regenerate with: node scripts/build-sql-bundle-2026-09-18.mjs

const BUNDLE = join(process.cwd(), "docs", "sql", "apply-2026-09-18.sql");
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const FILES = ["20260918_01_privacy_lockdown.sql", "20260918_02_study_signals.sql"];

const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE, "utf8").replace(/\r\n/g, "\n") : "";

describe("the 2026-09-18 SQL bundle", () => {
  it("carries every migration verbatim", () => {
    const missing = FILES.filter((file) => {
      const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/\r\n/g, "\n").trim();
      return !bundle.includes(sql);
    });
    expect(missing).toEqual([]);
  });

  it("runs the privacy lockdown before anything that depends on it", () => {
    const first = bundle.indexOf(`-- FILE: ${FILES[0]}`);
    const second = bundle.indexOf(`-- FILE: ${FILES[1]}`);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it("limits browser profile updates to the preference columns", () => {
    expect(bundle).toContain("revoke update on public.profiles from anon, authenticated;");
    expect(bundle).toContain("grant update (display_name, roasts_enabled) on public.profiles to authenticated;");
  });

  // The reason the lockdown exists. If a future edit reintroduces an
  // unconditional read policy on any of these tables, every student's
  // notes and mistakes are public again.
  it("never gives decks, questions or matches an open read policy", () => {
    const lockdown = readFileSync(join(MIGRATIONS, FILES[0]), "utf8");
    for (const table of ["decks", "questions", "matches", "match_answers", "mistake_breakdowns"]) {
      const policy = new RegExp(`on public\.${table}\s+for select[\s\S]*?using \(([^;]*)\);`, "i").exec(lockdown);
      expect(policy, table).not.toBeNull();
      expect(policy?.[1].trim(), table).not.toBe("true");
    }
  });
});
