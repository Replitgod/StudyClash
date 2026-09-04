// Telling a real answer apart from a transcriber talking to itself.
//
// Two separate things produce phantom student turns, and both end with the
// tutor responding to words nobody said.
//
// The first is the voice detector: a chair creak, a door, a breath crosses
// the threshold, and because the session auto-creates a response on every
// detected turn, a reply is already being generated before anyone knows
// there were no words in it.
//
// The second is nastier and is a well-known property of Whisper-family
// transcription models: fed silence or noise, they do not return an empty
// string. They return the most probable thing a human says at the end of an
// audio clip, learned from a training set full of videos. "Thank you."
// "Thanks for watching!" "you" "Bye." A tutor handed "Thank you." as the
// student's answer will react to it, and from the student's chair that is
// the app inventing dialogue out of thin air.
//
// Pure and tested, because the alternative is sitting in a room being quiet
// at a microphone and hoping.

/**
 * Stock phrases transcription models emit for silence.
 *
 * Kept deliberately tight. Every entry here is a phrase a student could
 * theoretically say, so each one is a trade: we lose the ability to respond
 * to a genuine "thanks" in exchange for not inventing an answer out of a
 * quiet room. That trade is worth it -- the cost of being wrong is one
 * unanswered pleasantry, and the silence nudge picks the conversation back
 * up a few seconds later either way.
 *
 * Only ever consulted for utterances that are *nothing but* one of these.
 * "Thank you, is it the mitochondria?" is a real answer and stays one.
 */
const SILENCE_ARTIFACTS = new Set([
  "you",
  "thank you",
  "thanks",
  "thank you very much",
  "thank you for watching",
  "thanks for watching",
  "thank you so much",
  "bye",
  "goodbye",
  "bye bye",
  "please subscribe",
  "subscribe",
  "okay",
  "ok",
  "mm",
  "mmm",
  "hmm",
  "uh",
  "um",
  "ah",
  "oh",
  "blank_audio",
  "silence",
  "music",
  "applause",
  "foreign",
]);

/** Strip the punctuation and casing that make the same artifact look different. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    // Bracketed annotations: [BLANK_AUDIO], (music), *sighs*
    .replace(/[[({*].*?[\])}*]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Is this transcript almost certainly not something the student said?
 *
 * Returns true for empty text, text with no letters or digits at all, and
 * utterances consisting solely of a known silence artifact.
 */
export function isLikelySilence(raw: string | null | undefined): boolean {
  if (!raw) return true;

  const trimmed = raw.trim();
  if (!trimmed) return true;

  // Punctuation, music notes, ellipses -- no content at all.
  if (!/[a-z0-9]/i.test(trimmed)) return true;

  const normalized = normalize(trimmed);
  if (!normalized) return true;

  if (SILENCE_ARTIFACTS.has(normalized)) return true;

  // "Thank you. Thank you." and "you you you" -- the same artifact repeated,
  // which is what these models do when handed a longer stretch of silence.
  const words = normalized.split(" ");
  if (words.length <= 8) {
    const unique = Array.from(new Set(words));
    const rebuilt = unique.join(" ");
    if (SILENCE_ARTIFACTS.has(rebuilt)) return true;
    if (unique.every((word) => SILENCE_ARTIFACTS.has(word))) return true;
  }

  return false;
}

/**
 * Is there enough here to judge as an answer?
 *
 * Separate from the silence check because they fail differently: silence
 * means do not respond at all, whereas a real but unintelligible mumble
 * means respond by asking them to say it again. One word is plenty -- "ATP"
 * and "water" are complete answers -- so this only rejects the genuinely
 * contentless.
 */
export function isAnswerable(raw: string | null | undefined): boolean {
  return !isLikelySilence(raw);
}
