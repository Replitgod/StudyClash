// Spreading the answer key across the options.
//
// The bank had 67 percent of its NCLEX keys on B, and between 42 and 63
// percent on B everywhere else. A candidate who guessed B on every NCLEX
// question would have scored 67 percent without reading one of them, which
// makes the bank useless for measuring anything and actively teaches a habit
// that fails on the real exam.
//
// This is a known property of AI-written items -- lib/server/questionShuffle.ts
// already says so in a comment, and already fixes it for deck questions. It
// was never applied to the exam banks, which are served in stored order.
//
// Reordering options is easy. Doing it without breaking the explanations is
// the actual problem: 47 of them say things like "Choice A inverts the
// definition of a catalyst", and moving the options turns that sentence into
// a lie. So every letter reference is remapped alongside the choices, and
// then checked -- `verifyRemap` re-reads the new explanation and asserts that
// every letter it cites still points at the same TEXT it cited before.
//
// Pure. The caller supplies the target position, reads rows and writes them.

export type Choice = { id: string; text: string };

export type BalanceResult = {
  choices: Choice[];
  correctAnswer: string;
  explanation: string;
  /** Old letter to new letter, for the caller to log or verify. */
  mapping: Record<string, string>;
  moved: boolean;
};

/** A, B, C… in the positions a question actually uses. */
function lettersFor(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

/**
 * Every way an explanation in this bank points at an option, in ONE pattern.
 *
 * One regex and one pass, and that is the whole point. The first version ran
 * three patterns in sequence and was quietly wrong: the first rewrote
 * "Choice A" to "Choice C", and then the bare-letter pattern saw the C it had
 * just written, matched it, and mapped it on to A -- putting the sentence
 * back where it started while appearing to work. Visiting each position
 * exactly once is the only reliable fix, and the tests for this caught it.
 *
 * Two shapes, in one alternation:
 *   1. a labelled reference -- "Choice A", "Option B", "the answer is C"
 *   2. a bare letter with a verb after it -- "D comes from squaring"
 *
 * A bare capital letter on its own is far too common in ordinary prose to
 * touch: these explanations are full of "A student who..." and "A colon
 * introduces...". The verb is what separates a reference from a sentence.
 */
const REFERENCE =
  /(?:\b((?:Choices?|choices?|Options?|options?)\s+|(?:[Tt]he\s+)?(?:correct\s+)?answer\s+is\s+(?:choice\s+|option\s+)?)([A-H])\b)|(?:(?<![A-Za-z"'])([A-H])(?=\s+(?:is|are|was|were|has|have|would|will|inverts?|forgets?|reports?|adds?|takes?|describes?|treats?|counts?|omits?|swaps?|divides?|multiplies|confuses?|repeats?|gives?|comes?|reaches?|subtracts?|ignores?|assumes?|states?|names?|uses?|puts?|leaves?|misses?|fails?|reverses?)\b))/g;

/**
 * Rewrite one question so its key sits at `targetLetter`.
 *
 * The choice TEXTS are reordered; the letters stay A, B, C… in place. That is
 * what makes the remap checkable: a letter's meaning changed, and `mapping`
 * records exactly how.
 */
export function balanceQuestion(args: {
  choices: Choice[];
  correctAnswer: string;
  explanation: string;
  targetLetter: string;
}): BalanceResult {
  const { choices, correctAnswer, explanation, targetLetter } = args;

  const letters = lettersFor(choices.length);
  const currentKey = correctAnswer.trim().toUpperCase();
  const target = targetLetter.trim().toUpperCase();

  const keyIndex = choices.findIndex((c) => c.id.toUpperCase() === currentKey);
  const targetIndex = letters.indexOf(target);

  // Nothing to do: the key is already where we want it, or the request names
  // a position this question does not have.
  if (keyIndex < 0 || targetIndex < 0 || keyIndex === targetIndex) {
    return {
      choices,
      correctAnswer: currentKey,
      explanation,
      mapping: Object.fromEntries(letters.map((l) => [l, l])),
      moved: false,
    };
  }

  // A transposition rather than a full shuffle: the key goes to the target
  // slot and whatever was there takes the key's old slot. Two letters change
  // meaning instead of four, which keeps the explanation remap small and the
  // diff reviewable.
  const texts = choices.map((c) => c.text);
  [texts[keyIndex], texts[targetIndex]] = [texts[targetIndex], texts[keyIndex]];

  const nextChoices: Choice[] = texts.map((text, i) => ({ id: letters[i], text }));

  const mapping: Record<string, string> = {};
  for (const letter of letters) mapping[letter] = letter;
  mapping[letters[keyIndex]] = letters[targetIndex];
  mapping[letters[targetIndex]] = letters[keyIndex];

  return {
    choices: nextChoices,
    correctAnswer: target,
    explanation: remapExplanation(explanation, mapping),
    mapping,
    moved: true,
  };
}

/**
 * Rewrite the option letters an explanation cites.
 *
 * Single pass over the original string, so a letter that swaps with another
 * cannot be rewritten twice — two sequential replaces would turn every A into
 * a B and then every B back into an A, leaving the text unchanged and the
 * explanation silently wrong.
 */
export function remapExplanation(explanation: string, mapping: Record<string, string>): string {
  return explanation.replace(REFERENCE, (match, prefix, labelled, bare) => {
    const letter = (labelled ?? bare) as string | undefined;
    if (!letter) return match;
    const mapped = mapping[letter.toUpperCase()];
    if (!mapped) return match;
    return (prefix ?? "") + mapped;
  });
}

/** Which option letters an explanation talks about. */
export function referencedLetters(explanation: string): string[] {
  const found = new Set<string>();
  for (const match of explanation.matchAll(REFERENCE)) {
    const letter = match[2] ?? match[3];
    if (typeof letter === "string") found.add(letter.toUpperCase());
  }
  return [...found].sort();
}

/**
 * Did the remap preserve meaning?
 *
 * The check that makes this safe to run over a whole bank unattended: every
 * letter the NEW explanation cites must point at the same option text that
 * the letter it replaced pointed at in the OLD one. If a rewrite ever
 * silently turned "Choice A is the dollar amount" into a sentence about the
 * wrong option, this returns false and the caller leaves the row alone.
 */
export function verifyRemap(args: {
  before: { choices: Choice[]; explanation: string };
  after: { choices: Choice[]; explanation: string };
  mapping: Record<string, string>;
}): { ok: boolean; reason?: string } {
  const { before, after, mapping } = args;

  const textAt = (choices: Choice[], letter: string) =>
    choices.find((c) => c.id.toUpperCase() === letter)?.text;

  // The same set of options, just in a different order.
  const beforeTexts = [...before.choices.map((c) => c.text)].sort();
  const afterTexts = [...after.choices.map((c) => c.text)].sort();
  if (beforeTexts.join("|") !== afterTexts.join("|")) {
    return { ok: false, reason: "the set of answer choices changed" };
  }

  // The explanation must be exactly what remapping the old one produces.
  //
  // Without this the check had a hole wide enough to drive the bug through:
  // it compared the OLD explanation's letters against the mapping and never
  // looked at the new text at all, so an explanation that had been rewritten
  // wrongly -- or not rewritten -- passed. Recomputing is exact.
  const expected = remapExplanation(before.explanation, mapping);
  if (expected !== after.explanation) {
    return {
      ok: false,
      reason: `explanation is not the remap of the original (expected "${expected.slice(0, 60)}…")`,
    };
  }

  for (const oldLetter of referencedLetters(before.explanation)) {
    const newLetter = mapping[oldLetter];
    if (!newLetter) return { ok: false, reason: `no mapping for ${oldLetter}` };

    const wanted = textAt(before.choices, oldLetter);
    const got = textAt(after.choices, newLetter);
    if (wanted !== got) {
      return {
        ok: false,
        reason: `${oldLetter} pointed at "${String(wanted).slice(0, 40)}…" but ${newLetter} now points at "${String(got).slice(0, 40)}…"`,
      };
    }
  }

  return { ok: true };
}

/**
 * Target letters for a run of questions, spread as evenly as the option
 * counts allow.
 *
 * Round-robin rather than random: random assignment on a bank this size
 * leaves visible lumps, and the whole point is that no position pays better
 * than another.
 */
export function targetLetters(count: number, optionCount: number): string[] {
  const letters = lettersFor(optionCount);
  return Array.from({ length: count }, (_, i) => letters[i % letters.length]);
}
