// Is this question fit to put in front of a student?
//
// The exam banks are hand-written SQL and AI-drafted rows reviewed in the
// admin queue, and both fail the same way: a correct_answer of "E" on a
// four-choice question, two choices with identical text, an explanation that
// argues for a different letter than the key. None of those throw. They ship,
// and a student loses a mark on a question that was wrong before they read it.
//
// So every route that publishes a question runs it through here first, and a
// test runs the whole seeded bank through it on every commit. A validator
// that only guards the admin form would miss the several hundred questions
// that arrived by migration.
//
// Pure and server-agnostic: no Supabase, no fetch. The rules are the thing
// worth testing, and they are testable on plain objects.

export type ValidationIssue = {
  /** Machine-readable, so a caller can group or filter without parsing prose. */
  code:
    | "missing_question_text"
    | "missing_explanation"
    | "missing_answer_key"
    | "missing_choices"
    | "too_few_choices"
    | "too_many_choices"
    | "duplicate_choice_id"
    | "duplicate_choice_text"
    | "empty_choice_text"
    | "answer_not_among_choices"
    | "unexpected_choices"
    | "explanation_contradicts_key"
    | "missing_metadata"
    | "answer_key_not_sorted";
  message: string;
};

export type QuestionForValidation = {
  section?: string | null;
  domain?: string | null;
  skill?: string | null;
  difficulty?: string | null;
  question_type?: string | null;
  question_text?: string | null;
  /** Either the parsed array or the raw JSON string, as it comes from the row. */
  answer_choices?: unknown;
  correct_answer?: string | null;
  explanation?: string | null;
};

type Choice = { id: string; text: string };

/** Four is the norm on every exam here; three and five both exist in the wild. */
const MIN_CHOICES = 2;
const MAX_CHOICES = 8;

function parseChoices(raw: unknown): Choice[] | null {
  if (raw === null || raw === undefined) return null;

  let value: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(value)) return null;

  return value.map((entry) => {
    const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      id: typeof row.id === "string" ? row.id.trim() : "",
      text: typeof row.text === "string" ? row.text.trim() : "",
    };
  });
}

/**
 * Does the explanation argue for a different answer than the key says?
 *
 * Deliberately narrow. It fires only when the explanation names a choice
 * letter in a plainly conclusive phrase -- "choice B is correct", "the answer
 * is D" -- and that letter is not the key. A looser rule would flag every
 * explanation that mentions why the other options are wrong, which is exactly
 * the kind of explanation this product wants more of.
 */
export function explanationNamesWrongAnswer(
  explanation: string,
  correctAnswer: string
): string | null {
  const key = correctAnswer.trim().toUpperCase();
  if (!/^[A-H]$/.test(key)) return null;

  const patterns = [
    /\b(?:choice|option|answer)\s+([A-H])\b\s+is\s+(?:the\s+)?correct\b/gi,
    /\bthe\s+(?:correct\s+)?answer\s+is\s+(?:choice\s+|option\s+)?([A-H])\b/gi,
    /\b([A-H])\s+is\s+(?:the\s+)?correct\s+(?:answer|choice|option)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of explanation.matchAll(pattern)) {
      const named = match[1].toUpperCase();
      if (named !== key) return named;
    }
  }

  return null;
}

/**
 * Everything wrong with one question, in one pass.
 *
 * Returns all issues rather than the first, because a reviewer fixing a
 * question wants the whole list -- coming back three times for three problems
 * on one row is how a review queue stops being used.
 */
export function validateQuestion(question: QuestionForValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (code: ValidationIssue["code"], message: string) => {
    issues.push({ code, message });
  };

  const type = (question.question_type || "").trim() || "multiple_choice";
  const text = (question.question_text || "").trim();
  const explanation = (question.explanation || "").trim();
  const key = (question.correct_answer || "").trim();

  if (!text) push("missing_question_text", "The question has no text.");
  if (!explanation) push("missing_explanation", "The question has no explanation.");
  if (!key) push("missing_answer_key", "The question has no correct answer.");

  // Metadata is not decoration: the bank picker filters on section and
  // difficulty, and the results breakdown groups on domain and skill. A row
  // missing any of them is invisible to half the product.
  for (const [field, value] of [
    ["section", question.section],
    ["domain", question.domain],
    ["skill", question.skill],
    ["difficulty", question.difficulty],
  ] as const) {
    if (!String(value || "").trim()) {
      push("missing_metadata", `The question has no ${field}.`);
    }
  }

  const choices = parseChoices(question.answer_choices);
  const needsChoices = type === "multiple_choice" || type === "multiple_response";

  if (needsChoices) {
    if (!choices) {
      push("missing_choices", `A ${type} question must have answer choices.`);
    } else {
      if (choices.length < MIN_CHOICES) {
        push("too_few_choices", `Only ${choices.length} answer choice(s).`);
      }
      if (choices.length > MAX_CHOICES) {
        push("too_many_choices", `${choices.length} answer choices is too many.`);
      }

      const ids = new Set<string>();
      const texts = new Set<string>();

      for (const choice of choices) {
        if (!choice.text) {
          push("empty_choice_text", `Choice "${choice.id || "?"}" has no text.`);
        }
        if (!choice.id) {
          push("duplicate_choice_id", "A choice has no id.");
        } else if (ids.has(choice.id.toUpperCase())) {
          push("duplicate_choice_id", `Choice id "${choice.id}" appears more than once.`);
        } else {
          ids.add(choice.id.toUpperCase());
        }

        // Two choices that read the same make the question unanswerable
        // however the key is set, since a student choosing the other one
        // gave the same answer.
        const normalized = choice.text.toLowerCase().replace(/\s+/g, " ");
        if (normalized) {
          if (texts.has(normalized)) {
            push("duplicate_choice_text", `Two choices read "${choice.text}".`);
          } else {
            texts.add(normalized);
          }
        }
      }

      if (key) {
        const selected =
          type === "multiple_response"
            ? key.split(/[,;|\s]+/).map((part) => part.trim().toUpperCase()).filter(Boolean)
            : [key.toUpperCase()];

        for (const id of selected) {
          if (!ids.has(id)) {
            push(
              "answer_not_among_choices",
              `The answer key names "${id}", which is not one of the choices.`
            );
          }
        }

        // The key is compared as a set at grading time, but it is read by
        // humans in the review queue and in exports. Storing it sorted means
        // two keys for the same answer are the same string.
        if (type === "multiple_response" && selected.length > 1) {
          const sorted = [...selected].sort();
          if (sorted.join(",") !== selected.join(",")) {
            push("answer_key_not_sorted", `The answer key should read "${sorted.join(",")}".`);
          }
        }
      }
    }
  } else if (choices && choices.length > 0) {
    push(
      "unexpected_choices",
      `A ${type} question should not have answer choices.`
    );
  }

  if (explanation && key) {
    const named = explanationNamesWrongAnswer(explanation, key);
    if (named) {
      push(
        "explanation_contradicts_key",
        `The explanation says choice ${named} is correct, but the key is ${key}.`
      );
    }
  }

  return issues;
}

/** True when a question is safe to publish. */
export function isPublishable(question: QuestionForValidation): boolean {
  return validateQuestion(question).length === 0;
}

/**
 * Questions that are effectively the same question.
 *
 * Identity is the stimulus AND the stem together, never the stem alone. On
 * the Digital SAT the stem is boilerplate -- "Which choice completes the text
 * with the most logical and precise word?" is shared by every words-in-context
 * item -- and the question is the passage above it. Keying on the stem alone
 * calls a dozen unrelated items duplicates of each other.
 *
 * That is not a hypothetical: the table's unique index was on
 * md5(question_text) alone, so 32 of the 98 seeded SAT questions were
 * silently discarded on insert by "on conflict do nothing" and the shipped
 * bank was a third smaller than the migrations said. See
 * 20260906_diagnostic_question_identity_fix.sql.
 */
export function findDuplicateQuestions(
  questions: Array<{ id?: string; question_text?: string | null; stimulus?: string | null }>
): Array<{ text: string; ids: string[] }> {
  const byNormalized = new Map<string, string[]>();

  questions.forEach((question, index) => {
    const normalized = `${question.stimulus || ""} ${question.question_text || ""}`
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!normalized) return;

    const id = question.id ?? `#${index}`;
    const existing = byNormalized.get(normalized);
    if (existing) existing.push(id);
    else byNormalized.set(normalized, [id]);
  });

  return [...byNormalized.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([text, ids]) => ({ text, ids }));
}
