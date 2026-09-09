// Turning something a student said into a topic the tutor can be grounded in.
//
// This exists because of the one thing the voice tutor could not do: be
// called about anything at all. Every session was built from a deck the
// student already owned, so a brand-new account -- or anyone who just wanted
// to talk about the Krebs cycle for ten minutes -- got a tutor with no
// material, and the prompt fell back to "they have no material loaded".
//
// Two callers, which is why this is pure and lives outside lib/server:
//
//   - the pre-call screen, so a typed topic can be validated before the
//     request is made and the student is told why an empty box will not do;
//   - the mid-call switch, where the phrase arrives as a transcript from a
//     speech model and is full of the things people actually say out loud.
//
// Everything here treats its input as hostile. A topic is interpolated into
// the tutor's instructions, so it is sanitised on the same terms as a note.

/** Longer than this is a paragraph, not a topic. */
const MAX_TOPIC_CHARS = 120;

/**
 * Shorter than this is not a subject.
 *
 * Two characters, because real topics get that short in the sciences and in
 * languages -- "pH", "SN2" -- and rejecting them would be worse than
 * occasionally accepting a stray syllable.
 */
const MIN_TOPIC_CHARS = 2;

/**
 * The scaffolding people put in front of a subject when they say it aloud.
 *
 * Stripped because the topic becomes a heading the tutor works from and a
 * cache key. "Teach me photosynthesis", "can you teach me photosynthesis"
 * and "photosynthesis" are one topic, and treating them as three would
 * regenerate the same concepts three times and bill for it.
 *
 * Order matters within a pass: the longest phrasings come first, so
 * "teach me about" is consumed before "teach me" can leave "about" behind.
 * The whole list is then applied repeatedly, so "actually, let's switch to
 * algebra 2" peels down to "algebra 2".
 */
const LEAD_INS = [
  "teach me about",
  "tell me about",
  "talk to me about",
  "help me understand",
  "help me with",
  "quiz me about",
  "quiz me on",
  "ask me about",
  "explain to me",
  "switch over to",
  "i would like to",
  "i'd like to",
  "the topic of",
  "how about",
  "what about",
  "move on to",
  "test me on",
  "i want to",
  "i need to",
  "let's try",
  "lets try",
  "let's do",
  "lets do",
  "switch to",
  "change to",
  "teach me",
  "quiz me",
  "test me",
  "help me",
  "ask me",
  "could you",
  "would you",
  "a bit of",
  "can you",
  "i want",
  "i need",
  "move to",
  "work on",
  "go to",
  "let's",
  "lets",
  "actually",
  "practice",
  "practice",
  "explain",
  "instead",
  "review",
  "please",
  "study",
  "okay",
  "wait",
  "some",
  "now",
  "hey",
  "the",
  "ok",
  "so",
  "um",
  "uh",
];

/** Trailing politeness and filler. Same reasoning as LEAD_INS. */
const TRAIL_OFFS = [
  "if that's okay",
  "if thats okay",
  "or something",
  "thank you",
  "if you can",
  "for me",
  "i guess",
  "instead",
  "thanks",
  "please",
  "now",
];

/**
 * Strip anything that could let a topic act as an instruction.
 *
 * The topic goes into the tutor's system instructions as a heading, which is
 * a smaller surface than the fenced material block but not a safe one: it is
 * the one piece of student text that appears ABOVE the fence. So it is
 * cleaned harder than a note -- no newlines survive at all, which removes
 * the shape every "\n\nSystem:" injection depends on.
 */
export function sanitizeTopic(raw: string): string {
  if (!raw) return "";

  return (
    raw
      // Control characters, plus the zero-width and bidi-override tricks that
      // hide text from a human and not from a tokenizer. Newlines included:
      // a topic is one line by definition.
      .replace(
        /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
        " "
      )
      // Chat-template control tokens.
      .replace(/<\|[^|>]{0,64}\|>/g, " ")
      // Role headers, which would read as the start of a new turn.
      .replace(/\b(system|developer|assistant|user)\s*:/gi, " ")
      // Markdown and fence characters that could open a block of their own.
      .replace(/[`*_#>[\]{}|\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alternation(phrases: string[]): string {
  // Longest first, so "teach me about" is consumed whole rather than
  // "teach me" matching and leaving "about" behind as the topic.
  return [...phrases]
    .sort((a, b) => b.length - a.length)
    .map(escapeForRegex)
    .join("|");
}

/**
 * The lookahead is the entire safety property here.
 *
 * A lead-in only counts when the next character ends the word, so "do" never
 * eats the start of "dogma" and "the" never eats the start of "theory". It
 * accepts punctuation as well as space because people say "actually, switch
 * to..." and the transcriber writes the comma; and it accepts end-of-string
 * so a phrase that is nothing BUT filler ("um") reduces to nothing.
 */
const LEAD_IN_RE = new RegExp(`^(?:${alternation(LEAD_INS)})(?=[\\s,;:.!?]|$)`, "i");

const TRAIL_OFF_RE = new RegExp(`(?:^|[\\s,;:.!?])(?:${alternation(TRAIL_OFFS)})$`, "i");

function trimPunctuation(value: string): string {
  return value
    .replace(/^[\s,;:.!?-]+/, "")
    .replace(/[\s,;:.!?]+$/, "")
    .trim();
}

function stripAffixes(value: string): string {
  let current = trimPunctuation(value);

  // Repeat until nothing changes: real utterances stack these ("okay so
  // actually can you quiz me on...") and one pass would leave most of it.
  for (let pass = 0; pass < 8; pass += 1) {
    const before = current;

    current = trimPunctuation(current.replace(LEAD_IN_RE, ""));
    current = trimPunctuation(current.replace(TRAIL_OFF_RE, ""));

    if (current === before) break;
  }

  return current;
}

/**
 * The student's phrase, as a topic -- or null when there is no topic in it.
 *
 * Null is a real answer and callers must handle it. "um" and "okay sure"
 * reduce to nothing, and starting a call grounded in nothing is worse than
 * telling the student the box is empty.
 */
export function normalizeTopic(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const cleaned = stripAffixes(sanitizeTopic(raw));
  if (cleaned.length < MIN_TOPIC_CHARS) return null;

  // Needs at least one letter or digit somewhere. "???" and "..." are not
  // subjects, and a transcriber hands those over routinely.
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return null;

  return cleaned.length <= MAX_TOPIC_CHARS
    ? cleaned
    : cleaned.slice(0, MAX_TOPIC_CHARS).trimEnd();
}

/**
 * The key two spellings of the same topic share.
 *
 * Used for the generated-concept cache. Deliberately lossy -- case,
 * punctuation and inner spacing all collapse -- because a cache miss costs a
 * model call and two seconds of silence on a live call, and the worst case
 * of a false hit is teaching "Algebra II" from concepts generated for
 * "algebra ii".
 */
export function topicKey(topic: string): string {
  // Affixes are stripped here too, not just in normalizeTopic. A caller
  // holding a raw phrase must land on the same key as one holding the
  // normalized topic, or "the Krebs cycle" and "Krebs cycle" are two cache
  // entries and two model calls for the same lesson.
  return stripAffixes(sanitizeTopic(topic))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a "switch" would land on the topic already in play. */
export function isSameTopic(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!a || !b) return false;
  const keyA = topicKey(a);
  const keyB = topicKey(b);
  return keyA.length > 0 && keyA === keyB;
}
