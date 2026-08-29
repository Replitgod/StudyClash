// The dual-mode coach router, and the studio session engine.
//
// Vyra speaks differently depending on how the student is listening, and
// the difference is not cosmetic:
//
//   VOICE  Two or three sentences, no markdown, and never read out "A, B,
//          C". Spoken monologues cause severe drop-off, and reading option
//          letters aloud turns active recall into multiple choice, which
//          is a strictly easier task and therefore a worse one.
//   TEXT   Maximum scannability. Headers, bullets, code and math blocks.
//
// The session engine handles the parts of a study block that are not
// questions: ambient audio, and a wellness check at the midpoint. The
// check exists because a student who is fading answers worse and blames
// themselves; asking costs one turn and salvages the rest of the block.

export type InterfaceMode = "voice" | "text";

export type AmbientTrack = "lofi_focus" | "ambient_rain" | "none";

export type SessionMilestone = "start" | "midpoint_check" | "final_stretch" | "complete";

export type SessionInit = {
  sessionDurationMinutes: number;
  ambientMusicEnabled: boolean;
  interfaceMode: InterfaceMode;
  /** Which ambient bed to use when enabled. */
  preferredTrack?: Exclude<AmbientTrack, "none">;
};

export type SessionState = {
  interface_mode: InterfaceMode;
  remaining_time_minutes: number;
  trigger_audio: AmbientTrack;
  session_milestone: SessionMilestone;
};

/* --------------------------------------------------------------- audio */

export function resolveAudio(init: SessionInit): AmbientTrack {
  if (!init.ambientMusicEnabled) return "none";
  return init.preferredTrack ?? "lofi_focus";
}

/* ------------------------------------------------------------ timeline */

/**
 * Where the session is now.
 *
 * The midpoint window is a band, not an instant: a tick that only fires at
 * exactly 50% will be missed whenever the client polls slightly off, and a
 * wellness check that never fires is the same as not having built one.
 */
export function milestoneFor(args: {
  elapsedMinutes: number;
  durationMinutes: number;
  /** True once the midpoint check has already been delivered. */
  midpointDone: boolean;
}): SessionMilestone {
  const duration = Math.max(1, args.durationMinutes);
  const elapsed = Math.max(0, args.elapsedMinutes);
  const progress = elapsed / duration;

  if (progress >= 1) return "complete";

  // A band of +/- 8% of the block, so a 30-minute session fires anywhere
  // between minute 12.6 and 17.4.
  if (!args.midpointDone && progress >= 0.42 && progress <= 0.58) {
    return "midpoint_check";
  }

  if (progress >= 0.85) return "final_stretch";
  return "start";
}

export function buildSessionState(args: {
  init: SessionInit;
  elapsedMinutes: number;
  midpointDone: boolean;
}): SessionState {
  const { init, elapsedMinutes, midpointDone } = args;
  const duration = Math.max(1, init.sessionDurationMinutes);

  return {
    interface_mode: init.interfaceMode,
    remaining_time_minutes: Math.max(0, Math.round(duration - elapsedMinutes)),
    trigger_audio: resolveAudio(init),
    session_milestone: milestoneFor({
      elapsedMinutes,
      durationMinutes: duration,
      midpointDone,
    }),
  };
}

/* -------------------------------------------------------- coach actions */

export type CoachActionType =
  | "wellness_check"
  | "confusion_breakdown"
  | "drill"
  | "session_complete";

export type CoachAction = {
  type: CoachActionType;
  /** What Vyra says out loud. Short, no markup. */
  spoken_payload: string;
  /** What Vyra renders on screen. Markdown, scannable. */
  text_payload: string;
};

/** Sentences, counted the way a listener would hear them. */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length;
}

export const MAX_SPOKEN_SENTENCES = 3;

/**
 * Enforces the voice contract on a spoken string.
 *
 * Strips markdown and emoji, then truncates to three sentences. This runs
 * on output rather than trusting the prompt: a model told to be brief is
 * usually brief, and "usually" is not a contract. Reading four sentences
 * of markdown asterisks aloud is a bug the student hears.
 */
export function toSpokenText(raw: string): string {
  const stripped = raw
    // Markdown emphasis, headers, list bullets, inline code.
    .replace(/[*_`#>]+/g, " ")
    .replace(/^\s*[-•]\s*/gm, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Emoji and pictographs: a screen reader says "warning sign".
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  const sentences = stripped.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [stripped];
  return sentences
    .slice(0, MAX_SPOKEN_SENTENCES)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a spoken line would give away multiple-choice letters.
 *
 * Voice mode must force open recall, and "is it A, B or C" collapses that
 * back into recognition.
 */
export function leaksOptionLetters(text: string): boolean {
  return /\b(?:option\s+)?[A-D]\s*(?:,|\)|\.|:)\s|\b[A-D]\s*,\s*[A-D]\b/.test(text);
}

export function wellnessCheck(remainingMinutes: number, durationMinutes: number): CoachAction {
  const spoken = `We are about halfway through our ${durationMinutes}-minute block. Take a breath and stretch. How are you holding up — good to push on, or should we slow down?`;

  const text = [
    "### Midpoint check",
    "",
    `You are halfway through a **${durationMinutes}-minute block**, with about **${remainingMinutes} minutes** left.`,
    "",
    "- **How is your energy?** Answering while fried teaches you the wrong things.",
    "- **Stuck on something?** Say *confused* and I will break it down before we carry on.",
    "- **Feeling sharp?** Say *keep going* and I will raise the difficulty.",
  ].join("\n");

  return { type: "wellness_check", spoken_payload: toSpokenText(spoken), text_payload: text };
}

export function confusionBreakdown(concept: string, analogy: string): CoachAction {
  const spoken = `Let's stop the drilling for a second. ${analogy} Tell me when that lands and we will pick the questions back up.`;

  const text = [
    `### Let's slow down on ${concept}`,
    "",
    analogy,
    "",
    "> Say **I understand now** when it clicks, and we will start testing again.",
  ].join("\n");

  return {
    type: "confusion_breakdown",
    spoken_payload: toSpokenText(spoken),
    text_payload: text,
  };
}

/** The text-mode Card Crack rendering, with the headers the brief specifies. */
export function renderCardCrackMarkdown(crack: {
  misconception: string;
  underlying_idea: string;
  how_to_spot: string;
  socratic_loop: string;
}): string {
  return [
    "**⚠️ Misconception detected**",
    crack.misconception,
    "",
    "**💡 Foundational truth**",
    crack.underlying_idea,
    "",
    "**🎯 Exam trick**",
    crack.how_to_spot,
    "",
    "**↩️ Repair it**",
    crack.socratic_loop,
  ].join("\n");
}

/** The voice-mode rendering of the same thing: no headers, no symbols. */
export function renderCardCrackSpoken(crack: {
  misconception: string;
  underlying_idea: string;
  socratic_loop: string;
}): string {
  return toSpokenText(
    `${crack.misconception} ${crack.underlying_idea} ${crack.socratic_loop}`
  );
}
