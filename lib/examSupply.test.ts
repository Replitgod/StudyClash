import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExamBlueprint } from "@/lib/examBlueprint";
import { describeModes } from "@/lib/examModes";

// Does each newly added exam actually have enough questions to run?
//
// An exam_definitions row with a blueprint is not a playable exam. examModes
// withholds any mode the bank cannot fill to two thirds of its intended
// length, which is the right behaviour and also an easy thing to ship
// blind: the migration looks complete, every test passes, and the card on
// /exams says "not built yet" because nothing checked that the bank was big
// enough for the structure it was written against.
//
// So this reads the real configuration out of the real migration and the
// real counts out of the real bank files, and asserts that at least one mode
// survives. It fails if a future edit shrinks a bank or lengthens a
// blueprint past what the bank can serve.

import { JEE_MAIN } from "@/scripts/banks/jeeMain";
import { NEET_UG } from "@/scripts/banks/neetUg";
import { USMLE_STEP_1 } from "@/scripts/banks/usmleStep1";

const DEFINITIONS = readFileSync(
  "supabase/migrations/20260910_02_jee_neet_usmle_definitions.sql",
  "utf8"
);

/** Pull one exam's configuration jsonb straight out of the migration. */
function blueprintFor(slug: string) {
  const match = new RegExp(`'${slug}'[\\s\\S]*?(\\{[\\s\\S]*?\\})'::jsonb`).exec(DEFINITIONS);
  if (!match) throw new Error(`No configuration found for ${slug}`);
  return parseExamBlueprint(JSON.parse(match[1].replace(/''/g, "'")));
}

function supplyOf(items: { section: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.section] = (counts[item.section] ?? 0) + 1;
  return counts;
}

const CASES = [
  { slug: "jee-main", label: "JEE Main", items: JEE_MAIN },
  { slug: "neet-ug", label: "NEET UG", items: NEET_UG },
  { slug: "usmle-step-1", label: "USMLE Step 1", items: USMLE_STEP_1 },
];

describe("new exam banks can actually be sat", () => {
  for (const { slug, label, items } of CASES) {
    it(`${label} offers at least one mode`, () => {
      const modes = describeModes(blueprintFor(slug), supplyOf(items));
      const offered = modes.filter((mode) => mode.offered).map((mode) => mode.mode);

      // Named in the message so a failure says which exam went dark rather
      // than "expected false to be true".
      expect(offered, `${label} offers no mode; its bank is too small for its blueprint`).not.toHaveLength(0);
    });

    it(`${label} covers every section in its blueprint`, () => {
      const blueprint = blueprintFor(slug);
      const supply = supplyOf(items);

      // A section with zero questions cannot be served at all, and on a
      // multi-section exam that means a student hits an empty section
      // partway through a sitting rather than being told up front.
      for (const section of blueprint.sections) {
        expect(supply[section.key] ?? 0, `${label} has no questions for "${section.key}"`).toBeGreaterThan(0);
      }
    });
  }
});
