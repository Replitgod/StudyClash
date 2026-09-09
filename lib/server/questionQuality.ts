// The flaws that let a student answer a question without knowing the answer.
//
// lib/server/questionBankValidation.ts asks whether a question is BROKEN --
// no key, duplicate choices, an explanation that contradicts itself. This
// asks something harder: whether a question is any good.
//
// Every rule here is a documented item-writing flaw, and each one is
// exploitable. Test-taking guides teach them explicitly, which is the point:
// if a strategy guide can beat your question bank, the bank is measuring
// test-wiseness instead of knowledge, and a student who practices on it
// learns a habit that will cost them marks on the real exam where these
// flaws have been edited out.
//
// The output is advisory. These are heuristics, and a genuine question will
// occasionally trip one -- a correct answer really is sometimes the longest,
// because the concept needs the words. So this reports and ranks; it does
// not block a publish the way validateQuestion does.

export type QualityFlaw = {
  code:
    | "longest_answer_is_key"
    | "key_position_bias"
    | "absolute_term_in_distractor"
    | "stem_word_echoed_in_key"
    | "all_of_the_above"
    | "stem_too_short"
    | "distractor_much_shorter"
    | "grammatical_cue";
  detail: string;
};

type Choice = { id: string; text: string };

function parseChoices(raw: unknown): Choice[] {
  if (!raw) return [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      return {
        id: typeof row.id === "string" ? row.id : "",
        text: typeof row.text === "string" ? row.text : "",
      };
    })
    .filter((c) => c.id && c.text);
}

/**
 * Words that are almost always wrong when they appear in an option.
 *
 * A student who knows nothing else knows to avoid "always" and "never",
 * because a careful writer puts absolutes only in options they intend to be
 * false. Using them is handing away a distractor.
 */
const ABSOLUTES = /\b(always|never|all|none|every|only|entirely|completely|impossible)\b/i;

/**
 * Absolutes that are not absolutes.
 *
 * "at all" is an intensifier, "all four side rails" is a quantity, and "only
 * until results return" is a clinical condition — none of them is the
 * sweeping generalization this rule is looking for. The first version flagged
 * an option reading "patrons seemed less anxious about visiting at all",
 * which is not a giveaway by any reading, and flagged half the NCLEX bank for
 * describing real interventions.
 */
const ABSOLUTE_EXCEPTIONS =
  /\b(?:at all|all (?:four|three|two|of the|fluids|patients|clients|side)|only (?:until|if|one of|when))\b/i;

/** Content words worth noticing when they repeat between stem and key. */
const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "was", "were", "and", "or",
  "for", "on", "at", "by", "with", "that", "this", "which", "what", "it", "its",
  "as", "be", "been", "from", "has", "have", "had", "not", "but", "they", "their",
  "would", "will", "can", "could", "should", "most", "best", "following", "when",
  "how", "why", "does", "do", "did", "his", "her", "them", "than", "then", "so",
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

export type QuestionForQuality = {
  question_text?: string | null;
  stimulus?: string | null;
  /** Read only to scope the short-stem rule away from mathematics. */
  section?: string | null;
  answer_choices?: unknown;
  correct_answer?: string | null;
  question_type?: string | null;
};

export function findQualityFlaws(question: QuestionForQuality): QualityFlaw[] {
  const flaws: QualityFlaw[] = [];
  const type = (question.question_type || "multiple_choice").trim();
  if (type !== "multiple_choice") return flaws;

  const choices = parseChoices(question.answer_choices);
  const key = (question.correct_answer || "").trim().toUpperCase();
  const correct = choices.find((c) => c.id.toUpperCase() === key);
  if (!correct || choices.length < 3) return flaws;

  const others = choices.filter((c) => c !== correct);
  const stem = (question.question_text || "").trim();

  // 1. The single most exploited flaw in multiple choice. A writer qualifies
  //    the true option carefully and leaves the false ones blunt, so the
  //    longest option is the answer far more often than chance.
  const longest = choices.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  if (longest === correct) {
    const runnerUp = Math.max(...others.map((c) => c.text.length));
    if (correct.text.length > runnerUp * 1.35 && correct.text.length - runnerUp > 12) {
      flaws.push({
        code: "longest_answer_is_key",
        detail: `The key is ${correct.text.length} characters and the longest distractor is ${runnerUp}.`,
      });
    }
  }

  // 2. The reverse: one option so short it reads as an afterthought nobody
  //    is meant to pick.
  const shortest = choices.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  if (shortest !== correct && choices.length >= 4) {
    const median = [...choices.map((c) => c.text.length)].sort((a, b) => a - b)[
      Math.floor(choices.length / 2)
    ];
    if (median > 24 && shortest.text.length * 3 < median) {
      flaws.push({
        code: "distractor_much_shorter",
        detail: `"${shortest.text}" is far shorter than the others and reads as filler.`,
      });
    }
  }

  // 3. Absolutes are a giveaway. Flagged only in distractors: a key that
  //    legitimately contains "never" is a real thing.
  for (const choice of others) {
    if (ABSOLUTES.test(choice.text) && !ABSOLUTE_EXCEPTIONS.test(choice.text)) {
      flaws.push({
        code: "absolute_term_in_distractor",
        detail: `Distractor ${choice.id} contains an absolute ("${(ABSOLUTES.exec(choice.text) || [])[0]}"), which trains students to eliminate it on sight.`,
      });
      break;
    }
  }

  // 4. Clang cue: an unusual word from the stem repeated only in the key.
  const stemWords = contentWords(stem);
  const keyWords = contentWords(correct.text);
  const otherWords = new Set(others.flatMap((c) => [...contentWords(c.text)]));
  // A word that also appears in the passage is passage vocabulary, not a
  // clang cue. On an evidence question the stem names the variables being
  // controlled for -- "the plaza, not income or density" -- and the correct
  // evidence has to mention those same variables to BE the right evidence.
  // Flagging that punishes the question type for working properly.
  const stimulusWords = contentWords(question.stimulus || "");
  const echoed = [...keyWords].filter(
    (w) => stemWords.has(w) && !otherWords.has(w) && !stimulusWords.has(w)
  );
  if (echoed.length > 0) {
    flaws.push({
      code: "stem_word_echoed_in_key",
      detail: `"${echoed[0]}" appears in the stem and in the key but in no distractor.`,
    });
  }

  // 5. "All of the above" collapses a four-option question into a two-option
  //    one: recognising two true options settles it.
  if (choices.some((c) => /\b(all|none) of the above\b/i.test(c.text))) {
    flaws.push({
      code: "all_of_the_above",
      detail: "An all/none-of-the-above option makes the question answerable from partial knowledge.",
    });
  }

  // 6. A stem too short to pose a problem is usually testing recall.
  const hasStimulus = Boolean((question.stimulus || "").trim());
  // ...outside mathematics, where "If 3x + 7 = 22, what is x?" is exactly
  // what the real exam asks and the reasoning lives in the algebra rather
  // than in the wording. Scoping the rule is honest; applying it to a math
  // section would only mean padding stems to satisfy a checker.
  const isMath = /math|quant/i.test(question.section || "");
  if (!isMath && !hasStimulus && stem.length < 40) {
    flaws.push({
      code: "stem_too_short",
      detail: `The stem is ${stem.length} characters with no stimulus, so there is little to reason about.`,
    });
  }

  // 7. Grammatical cueing: the stem ends in an article that only agrees with
  //    one option.
  const article = /\b(an|a)\s*$/i.exec(stem.replace(/[_\s]+$/, " ").trimEnd());
  if (article) {
    const wantsVowel = article[1].toLowerCase() === "an";
    const agreeing = choices.filter(
      (c) => /^[aeiou]/i.test(c.text.trim()) === wantsVowel
    );
    if (agreeing.length === 1 && agreeing[0] === correct) {
      flaws.push({
        code: "grammatical_cue",
        detail: `The stem ends in "${article[1]}" and only the key agrees with it grammatically.`,
      });
    }
  }

  return flaws;
}

/**
 * Is the answer key spread across the options, or does it pile onto one?
 *
 * Checked per exam-section rather than per question, because it is only
 * visible in aggregate. A bank where 60 percent of keys are C rewards
 * guessing C, and every student eventually notices.
 */
export function keyPositionBias(
  questions: Array<{ correct_answer?: string | null; question_type?: string | null }>
): { counts: Record<string, number>; total: number; worst: string; share: number } {
  const counts: Record<string, number> = {};
  let total = 0;

  for (const question of questions) {
    if ((question.question_type || "multiple_choice") !== "multiple_choice") continue;
    const key = (question.correct_answer || "").trim().toUpperCase();
    if (!/^[A-H]$/.test(key)) continue;
    counts[key] = (counts[key] ?? 0) + 1;
    total += 1;
  }

  let worst = "";
  let worstCount = 0;
  for (const [key, n] of Object.entries(counts)) {
    if (n > worstCount) {
      worst = key;
      worstCount = n;
    }
  }

  return { counts, total, worst, share: total > 0 ? worstCount / total : 0 };
}
